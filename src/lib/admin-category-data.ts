import "server-only";
import { sortStores } from "@/lib/stores";
import type { Attribute } from "@/lib/attributes";
import { buildCategoryIndex, CATEGORY_COLUMNS, fullPath, type Category } from "@/lib/categories";
import { isRangePastEnd, pageRange, type Pagination } from "@/lib/pagination";
import { peopleNames, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { allRows } from "@/lib/supabase/all-rows";
import type { Tables } from "@/lib/types/database.types";
import { UNIT_COLUMNS, UNIT_PRESET_COLUMNS, type Unit, type UnitPreset } from "@/lib/uom";
import { CUSTOMER_TAG_COLUMNS, CUSTOMER_TYPE_COLUMNS, type CustomerTag, type CustomerTypeOption } from "@/lib/customer-lists";
import { countTags } from "@/lib/customer-list-data";

// Console reads for Phase 18 (industries, catalogs, organization categories, attributes, requests).
// Service role behind requireSuperadmin(): the console sees every industry and organization.

export type Industry = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  defaultModules: string[];
  defaultUoms: string[];
  pricesIncludeTax: boolean;
  onboardingSteps: string[];
  organizations: number;
  categories: number;
};

export type { Attribute };

function mapIndustry(i: Tables<"industries">, organizations: number, categories: number): Industry {
  const settings = (i.default_settings ?? {}) as { prices_include_tax?: boolean };
  return {
    id: i.id,
    name: i.name,
    slug: i.slug,
    description: i.description ?? "",
    icon: i.icon,
    sortOrder: i.sort_order,
    isActive: i.is_active,
    defaultModules: i.default_modules,
    defaultUoms: i.default_uoms,
    pricesIncludeTax: settings.prices_include_tax ?? true,
    onboardingSteps: i.onboarding_steps,
    organizations,
    categories,
  };
}

/** Every industry with how many organizations and catalog categories it has. */
export async function getIndustries(): Promise<Industry[]> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const [{ data, error }, tenants, cats] = await Promise.all([
    admin.from("industries").select("*").order("sort_order").order("name"),
    allRows((a, b) => admin.from("tenants").select("industry_id").order("id").range(a, b)),
    // Only the industry column of catalog rows (1,200+ across the seeded catalogs).
    allRows((a, b) => admin.from("categories").select("industry_id").not("industry_id", "is", null).order("id").range(a, b)),
  ]);
  if (error) throw new Error(`industries: ${error.message}`);
  const orgs = new Map<string, number>();
  for (const t of tenants) orgs.set(t.industry_id, (orgs.get(t.industry_id) ?? 0) + 1);
  const catCounts = new Map<string, number>();
  for (const c of cats) if (c.industry_id) catCounts.set(c.industry_id, (catCounts.get(c.industry_id) ?? 0) + 1);
  return (data ?? []).map((i) => mapIndustry(i, orgs.get(i.id) ?? 0, catCounts.get(i.id) ?? 0));
}

/** Industries for Create Organization's picker: the open ones (a closed industry takes no new organizations). */
export async function getIndustryChoices() {
  await requireSuperadmin();
  const { data, error } = await createAdminClient().from("industries").select("id, name, icon").eq("is_active", true).order("sort_order").order("name");
  if (error) throw new Error(`industries: ${error.message}`);
  return (data ?? []).map((i) => ({ id: i.id, name: i.name, icon: i.icon }));
}

export type IndustryChoice = Awaited<ReturnType<typeof getIndustryChoices>>[number];

/** One industry's catalog with usage across organizations (items directly on each category). */
export async function getCatalog(industryId: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const [categories, { data: usage }, { data: attributes }] = await Promise.all([
    allRows((a, b) => admin.from("categories").select(CATEGORY_COLUMNS).eq("industry_id", industryId).order("id").range(a, b)),
    admin.rpc("admin_category_usage", { p_industry: industryId }),
    admin.from("category_attributes").select("*").eq("industry_id", industryId).order("sort_order").order("label"),
  ]);
  const items: Record<string, number> = {};
  const orgs: Record<string, number> = {};
  for (const u of usage ?? []) {
    items[u.category_id] = Number(u.items);
    orgs[u.category_id] = Number(u.tenants);
  }
  return { categories: categories as Category[], items, orgs, attributes: (attributes ?? []) as Attribute[] };
}

/**
 * An organization's categories as the console shows them: its industry's catalog (with what's hidden for
 * it), its own categories, its item counts and its own attributes.
 */
export async function getTenantCategoryView(tenantId: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { data: tenant, error } = await admin.from("tenants").select("id, name, industry_id, industries(name)").eq("id", tenantId).single();
  if (error) throw new Error(`tenant: ${error.message}`);
  const [catalog, own, hidden, items, { data: attributes }, { data: industryAttributes }] = await Promise.all([
    allRows((a, b) => admin.from("categories").select(CATEGORY_COLUMNS).eq("industry_id", tenant.industry_id).order("id").range(a, b)),
    allRows((a, b) => admin.from("categories").select(CATEGORY_COLUMNS).eq("tenant_id", tenantId).order("id").range(a, b)),
    allRows((a, b) => admin.from("tenant_hidden_categories").select("category_id").eq("tenant_id", tenantId).order("category_id").range(a, b)),
    allRows((a, b) => admin.from("inventory_items").select("category_id").eq("tenant_id", tenantId).order("id").range(a, b)),
    admin.from("category_attributes").select("*").eq("tenant_id", tenantId).order("sort_order").order("label"),
    admin.from("category_attributes").select("*").eq("industry_id", tenant.industry_id).order("sort_order").order("label"),
  ]);
  const counts: Record<string, number> = {};
  for (const { category_id } of items) counts[category_id] = (counts[category_id] ?? 0) + 1;
  return {
    tenantName: tenant.name,
    industryId: tenant.industry_id,
    industryName: tenant.industries?.name ?? "",
    categories: [...catalog, ...own] as Category[],
    hiddenIds: hidden.map((h) => h.category_id),
    counts,
    attributes: (attributes ?? []) as Attribute[],
    industryKeys: (industryAttributes ?? []).map((a) => a.key),
    industryAttributes: (industryAttributes ?? []) as Attribute[],
  };
}

export type CategoryRequestView = {
  id: string;
  tenantId: string;
  tenantName: string;
  industryId: string;
  industryName: string;
  name: string;
  note: string | null;
  status: "pending" | "approved_tenant" | "approved_industry" | "rejected";
  suggestedParentId: string | null;
  suggestedParentPath: string | null;
  requester: string;
  resolver: string | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

/** Category requests for /admin/categories/requests: pending first (oldest first), then the last 100 resolved. */
export async function getAllCategoryRequests(): Promise<CategoryRequestView[]> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const select = "id, tenant_id, name, note, status, suggested_parent_id, requested_by, resolved_by, resolution_note, created_at, resolved_at, tenants(name, industry_id, industries(name))";
  const [{ data: pending }, { data: resolved }] = await Promise.all([
    admin.from("category_requests").select(select).eq("status", "pending").order("created_at"),
    admin.from("category_requests").select(select).neq("status", "pending").order("resolved_at", { ascending: false }).limit(100),
  ]);
  const rows = [...(pending ?? []), ...(resolved ?? [])];

  // Suggested parents' full paths (catalog or organization rows).
  const parentIds = [...new Set(rows.map((r) => r.suggested_parent_id).filter((id): id is string => Boolean(id)))];
  const paths = new Map<string, string>();
  if (parentIds.length) {
    const scope = `industry_id.in.(${[...new Set(rows.map((r) => r.tenants?.industry_id).filter(Boolean))].join(",")}),tenant_id.in.(${[...new Set(rows.map((r) => r.tenant_id))].join(",")})`;
    const all = await allRows((a, b) => admin.from("categories").select(CATEGORY_COLUMNS).or(scope).order("id").range(a, b));
    const index = buildCategoryIndex(all as Category[]);
    for (const id of parentIds) {
      const node = index.byId.get(id);
      if (node) paths.set(id, fullPath(node));
    }
  }
  const names = await peopleNames(rows.flatMap((r) => [r.requested_by, r.resolved_by]).filter((id): id is string => Boolean(id)));

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    tenantName: r.tenants?.name ?? "An organization",
    industryId: r.tenants?.industry_id ?? "",
    industryName: r.tenants?.industries?.name ?? "",
    name: r.name,
    note: r.note,
    status: r.status as CategoryRequestView["status"],
    suggestedParentId: r.suggested_parent_id,
    suggestedParentPath: r.suggested_parent_id ? (paths.get(r.suggested_parent_id) ?? null) : null,
    requester: r.requested_by ? (names.get(r.requested_by)?.fullName ?? "A user") : "A removed user",
    resolver: r.resolved_by ? (names.get(r.resolved_by)?.fullName ?? null) : null,
    resolutionNote: r.resolution_note,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }));
}

/** Pending requests (the console nav badge). */
export async function pendingRequestCount() {
  const { count } = await createAdminClient().from("category_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}

export type RemapRow = {
  categoryId: string;
  path: string;
  items: number;
  /** Best guess in the new tree: same full path, else same name; null when nothing matches. */
  suggestion: string | null;
};

/**
 * What changing an organization's industry needs (deliverable 2): every category its items use that won't
 * survive (the old catalog and its own categories under it), with a suggested new category for each, plus the
 * new tree to pick from (the new catalog and its own top-level categories, which stay).
 */
export async function getRemapPlan(tenantId: string, newIndustryId: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("industry_id").eq("id", tenantId).single();
  if (!tenant) throw new Error("Organization not found.");
  const [oldCatalog, own, newCatalog, items] = await Promise.all([
    allRows((a, b) => admin.from("categories").select(CATEGORY_COLUMNS).eq("industry_id", tenant.industry_id).order("id").range(a, b)),
    allRows((a, b) => admin.from("categories").select(CATEGORY_COLUMNS).eq("tenant_id", tenantId).order("id").range(a, b)),
    allRows((a, b) => admin.from("categories").select(CATEGORY_COLUMNS).eq("industry_id", newIndustryId).order("id").range(a, b)),
    allRows((a, b) => admin.from("inventory_items").select("category_id").eq("tenant_id", tenantId).order("id").range(a, b)),
  ]);
  const oldIndex = buildCategoryIndex([...oldCatalog, ...own] as Category[]);
  // Own categories survive only when their whole branch is the organization's own.
  const survivingOwn = own.filter((c) => {
    const node = oldIndex.byId.get(c.id);
    if (!node) return false;
    let cur = node;
    while (cur.parent_id) {
      const parent = oldIndex.byId.get(cur.parent_id);
      if (!parent || !parent.tenant_id) return false;
      cur = parent;
    }
    return true;
  }) as Category[];
  const survivingIds = new Set(survivingOwn.map((c) => c.id));
  const newIndex = buildCategoryIndex([...(newCatalog as Category[]), ...survivingOwn]);
  const targets = newIndex.flat.filter((n) => !n.archived);

  const counts = new Map<string, number>();
  for (const { category_id } of items) counts.set(category_id, (counts.get(category_id) ?? 0) + 1);

  const rows: RemapRow[] = [];
  for (const [categoryId, n] of counts) {
    if (survivingIds.has(categoryId)) continue;
    const node = oldIndex.byId.get(categoryId);
    if (!node) continue;
    const path = fullPath(node).toLowerCase();
    const byPath = targets.find((t) => fullPath(t).toLowerCase() === path);
    const byName = targets.find((t) => t.name.toLowerCase() === node.name.toLowerCase());
    rows.push({ categoryId, path: fullPath(node), items: n, suggestion: (byPath ?? byName)?.id ?? null });
  }
  rows.sort((a, b) => a.path.localeCompare(b.path));
  return { rows, targets: targets.map((t) => ({ id: t.id, path: fullPath(t), own: Boolean(t.tenant_id) })) };
}

/** For approving pending requests: each requesting organization's tree (its industry's catalog + its own categories). */
export async function getRequestTrees(requests: CategoryRequestView[]): Promise<Record<string, Category[]>> {
  const pending = requests.filter((r) => r.status === "pending");
  if (!pending.length) return {};
  const admin = createAdminClient();
  const industryIds = [...new Set(pending.map((r) => r.industryId))];
  const tenantIds = [...new Set(pending.map((r) => r.tenantId))];
  const [catalog, own, hidden] = await Promise.all([
    allRows((a, b) => admin.from("categories").select(CATEGORY_COLUMNS).in("industry_id", industryIds).order("id").range(a, b)),
    allRows((a, b) => admin.from("categories").select(CATEGORY_COLUMNS).in("tenant_id", tenantIds).order("id").range(a, b)),
    allRows((a, b) => admin.from("tenant_hidden_categories").select("tenant_id, category_id").in("tenant_id", tenantIds).order("tenant_id").order("category_id").range(a, b)),
  ]);
  const trees: Record<string, Category[]> = {};
  for (const r of pending) {
    if (trees[r.tenantId]) continue;
    const hide = new Set(hidden.filter((h) => h.tenant_id === r.tenantId).map((h) => h.category_id));
    trees[r.tenantId] = [
      ...(catalog as Category[]).filter((c) => c.industry_id === r.industryId && !hide.has(c.id)),
      ...(own as Category[]).filter((c) => c.tenant_id === r.tenantId),
    ];
  }
  return trees;
}

/** The organization's Industry & modules tab: its industry, switched-on modules and what its plan allows. */
export async function getTenantIndustryView(tenantId: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const [{ data: tenant, error }, { data: sub }, industries, { data: onboarding }] = await Promise.all([
    admin.from("tenants").select("industry_id, modules").eq("id", tenantId).single(),
    admin.from("tenant_subscriptions").select("plan:subscription_plans!tenant_subscriptions_plan_id_fkey(name, allowed_modules)").eq("tenant_id", tenantId).maybeSingle(),
    getIndustries(),
    admin.rpc("admin_onboarding", { p_tenant: tenantId }),
  ]);
  if (error) throw new Error(`tenant: ${error.message}`);
  return {
    industryId: tenant.industry_id,
    modules: tenant.modules,
    planName: sub?.plan?.name ?? null,
    /** null = every module. */
    planModules: sub?.plan ? sub.plan.allowed_modules : null,
    industries,
    onboarding: (onboarding ?? []) as { step: string; done: boolean }[],
  };
}

/** RF-18.3: setup progress of every organization (Organizations list → Setup column), by tenant id. */
export async function getSetupProgress(): Promise<Map<string, { done: number; total: number }>> {
  await requireSuperadmin();
  const { data, error } = await createAdminClient().rpc("admin_onboarding_summary");
  if (error) console.error("admin_onboarding_summary failed:", error.message);
  return new Map((data ?? []).map((r) => [r.tenant_id, { done: r.done, total: r.total }]));
}

/** The Overview tab's industry and setup figures. */
export async function getTenantSetupSummary(tenantId: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const [{ data: tenant }, { data: onboarding }] = await Promise.all([
    admin.from("tenants").select("modules, onboarding_dismissed_at, industries(name)").eq("id", tenantId).maybeSingle(),
    admin.rpc("admin_onboarding", { p_tenant: tenantId }),
  ]);
  const steps = (onboarding ?? []) as { step: string; done: boolean }[];
  return {
    industryName: tenant?.industries?.name ?? "Unknown",
    modules: tenant?.modules ?? [],
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    dismissed: Boolean(tenant?.onboarding_dismissed_at),
  };
}

export type AdminProduct = Pick<
  Tables<"inventory_items">,
  | "id"
  | "sku"
  | "name"
  | "description"
  | "vendor_name"
  | "category_id"
  | "cost_price"
  | "selling_price"
  | "quantity_on_hand"
  | "low_stock_threshold"
  | "price_includes_tax"
  | "is_universal"
  | "attributes"
  | "updated_at"
  | "base_uom_id"
> & {
  /** Phase 20: stock per store. */
  stock_levels: { store_id: string; on_hand: number; reserved: number }[];
};

/** One organization's stores for the console's Products tab (stock is set per store). */
export async function getTenantStoreOptions(tenantId: string) {
  await requireSuperadmin();
  const { data, error } = await createAdminClient()
    .from("stores")
    .select("id, name, is_main, is_active, sort_order")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`stores: ${error.message}`);
  return sortStores(data);
}

/** One organization's units of measure, archived ones too (console Products tab and Settings parity). */
export async function getTenantUnits(tenantId: string): Promise<Unit[]> {
  await requireSuperadmin();
  const { data, error } = await createAdminClient()
    .from("units_of_measure")
    .select(UNIT_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("sort_order")
    .order("code");
  if (error) throw new Error(`units_of_measure: ${error.message}`);
  return data;
}

/** The platform's unit presets (the console's Add unit picks). */
export async function getUnitPresetsForConsole(): Promise<UnitPreset[]> {
  await requireSuperadmin();
  const { data, error } = await createAdminClient().from("uom_presets").select(UNIT_PRESET_COLUMNS).order("sort_order");
  if (error) throw new Error(`uom_presets: ${error.message}`);
  return data;
}

/** The console's Products tab: one organization's products (search by name or SKU, filter by category and below), a page at a time. */
export async function getTenantProducts(tenantId: string, filters: { q: string; categoryIds: string[] | null }, pagination: Pagination) {
  await requireSuperadmin();
  const admin = createAdminClient();
  let query = admin
    .from("inventory_items")
    .select("id, sku, name, description, vendor_name, category_id, cost_price, selling_price, quantity_on_hand, low_stock_threshold, price_includes_tax, is_universal, attributes, updated_at, base_uom_id, stock_levels(store_id, on_hand, reserved)", { count: "exact" })
    .eq("tenant_id", tenantId);
  // Characters PostgREST's or() filter would read as syntax.
  const q = filters.q.replace(/[%,()*\\]/g, " ").trim();
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);
  if (filters.categoryIds) query = query.in("category_id", filters.categoryIds);
  const { from, to } = pageRange(pagination);
  const { data, count, error } = await query.order("name").range(from, to);
  if (error && !isRangePastEnd(error)) throw new Error(`inventory_items: ${error.message}`);
  const rows = ((data ?? []) as AdminProduct[]).map((p) => ({
    ...p,
    stock_levels: p.stock_levels.map((l) => ({ ...l, on_hand: Number(l.on_hand), reserved: Number(l.reserved) })),
  }));
  return { rows, total: count ?? 0, ...pagination };
}

/** One organization's customer types, tags and customers per tag (console parity for Settings → Customers). */
export async function getTenantCustomerLists(tenantId: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const [types, tags, links] = await Promise.all([
    admin.from("customer_types").select(CUSTOMER_TYPE_COLUMNS).eq("tenant_id", tenantId).order("sort_order").order("name"),
    admin.from("customer_tags").select(CUSTOMER_TAG_COLUMNS).eq("tenant_id", tenantId).order("name"),
    allRows((a, b) => admin.from("customer_tag_links").select("tag_id").eq("tenant_id", tenantId).order("customer_id").order("tag_id").range(a, b)),
  ]);
  if (types.error || tags.error) throw new Error(`customer lists: ${(types.error ?? tags.error)?.message}`);
  return { types: types.data as CustomerTypeOption[], tags: tags.data as CustomerTag[], counts: countTags(links) };
}

/** One organization's packs switch and how many of its products have packs (console Units & customers). */
export async function getTenantPackState(tenantId: string) {
  await requireSuperadmin();
  const admin = createAdminClient();
  const [tenant, conversions] = await Promise.all([
    admin.from("tenants").select("packs_enabled").eq("id", tenantId).maybeSingle(),
    admin.from("item_uom_conversions").select("item_id").eq("tenant_id", tenantId),
  ]);
  return { packsEnabled: tenant.data?.packs_enabled ?? false, packProducts: new Set((conversions.data ?? []).map((r) => r.item_id)).size };
}
