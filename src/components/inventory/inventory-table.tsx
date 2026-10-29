"use client";

import { createElement, Fragment, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Car, CheckCircle2, ChevronDown, ChevronRight, Layers, Loader2, Package, Pencil, Plus, Trash2 } from "lucide-react";
import type { Attribute } from "@/lib/attributes";
import { buildCategoryIndex, categoryIcon, fullPath, shortPath, type Category, type CategoryNode } from "@/lib/categories";
import { formatMoney, formatVehicleGroups, marginPercent, type MoneyFormat } from "@/lib/format";
import type { InventoryPage } from "@/lib/actions/inventory";
import { getProductGroup } from "@/lib/actions/product-groups";
import { kitAvailable } from "@/lib/kits";
import { notify } from "@/lib/notify";
import { thumbUrl } from "@/lib/product-images";
import { priceAt, stockAt, type StoreView } from "@/lib/stock";
import type { FitmentVehicle, InventoryEntry, InventoryListItem, ProductGroupEntry } from "@/lib/types/inventory";
import { formatQty, type Unit } from "@/lib/uom";
import { CategoryBadge } from "@/components/categories/category-tree";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { DeleteItemDialog } from "./delete-item-dialog";
import { InventoryItemDetails } from "./inventory-item-details";
import { InventoryItemDialog } from "./inventory-item-dialog";
import { ProductGroupDialog } from "./product-group-dialog";
import { OtherStoresStock } from "./store-stock";

type Props = {
  /** One page of products, kits and product groups + totals for everything matching the filters. */
  result: InventoryPage;
  money: MoneyFormat;
  /** Shop default for new items (tenants.prices_include_tax). */
  pricesIncludeTax: boolean;
  categories: Category[];
  attributes: Attribute[];
  /** The organization's units of measure (for the product dialog). */
  units: Unit[];
  /** Settings → Units: packs switched on. */
  packsEnabled: boolean;
  /** Vehicle Fitment module on: the fitment and vehicle columns show. */
  fitment: boolean;
  /** True when a search/category/stock/fitment filter is active (changes the empty state). */
  filtered: boolean;
  /** Phase 20: with more than one store, stock and prices show for the current store. */
  storeView: StoreView;
  /** Phase 21: "grouped" (a product group is one row) or "flat" (every SKU). */
  view: "grouped" | "flat";
};

function FitmentBadge({ universal }: { universal: boolean }) {
  if (universal) {
    return (
      <span className="badge badge-green">
        <CheckCircle2 size={12} /> Universal Fit
      </span>
    );
  }
  return (
    <span className="badge badge-blue">
      <Car size={12} /> Vehicle Specific
    </span>
  );
}

const VEHICLE_LINES = 2;

/** Make Model Year(s), one line per model; long lists collapse to "+N more". */
function VehicleCell({ universal, vehicles }: { universal: boolean; vehicles: FitmentVehicle[] }) {
  if (universal) return <span className="vehicle-cell-all">All vehicles</span>;
  const groups = formatVehicleGroups(vehicles);
  const shown = groups.slice(0, VEHICLE_LINES);
  const hidden = groups.length - shown.length;
  return (
    <div className="vehicle-cell" title={hidden > 0 ? groups.join("\n") : undefined}>
      {shown.map((label) => (
        <span key={label}>{label}</span>
      ))}
      {hidden > 0 && <span className="vehicle-cell-more">+{hidden} more</span>}
    </div>
  );
}

function MarginBadge({ cost, selling }: { cost: number; selling: number }) {
  const margin = marginPercent(cost, selling);
  if (margin === null) return <span className="badge">—</span>;
  const tone = margin < 0 ? "badge-red" : margin >= 50 ? "badge-green" : "badge-amber";
  return <span className={`badge ${tone}`}>{margin.toFixed(1)}% Margin</span>;
}

/** Available = on hand − reserved on open quotations; the low-stock alert uses available. */
export const availableOf = (item: Pick<InventoryListItem, "quantity_on_hand" | "reserved_quantity">) =>
  item.quantity_on_hand - item.reserved_quantity;

/** The stock the row shows: the current store's with more than one store, else the totals. */
export function shownStock(item: InventoryListItem, view: StoreView) {
  if (item.is_kit) {
    // RF-21.1: whole kits its products make; kits have no alert level of their own.
    const kits = kitAvailable(item.kit, view.multi ? view.currentId : null);
    return { onHand: kits, reserved: 0, available: kits, threshold: -1 };
  }
  if (!view.multi) {
    return { onHand: item.quantity_on_hand, reserved: item.reserved_quantity, available: availableOf(item), threshold: item.low_stock_threshold };
  }
  const at = stockAt(item.stock, view.currentId);
  return { ...at, threshold: at.threshold ?? item.low_stock_threshold };
}

const isLow = (s: ReturnType<typeof shownStock>) => s.threshold >= 0 && s.available <= s.threshold;

function StockCell({ item, view }: { item: InventoryListItem; view: StoreView }) {
  const shown = shownStock(item, view);
  const { onHand, reserved, available, threshold } = shown;
  const unit = item.base_uom?.code;
  if (item.is_kit) {
    return (
      <div className="stock-cell">
        <span className={`badge ${available > 0 ? "badge-green" : "badge-red"}`}>
          {available > 0 ? `${formatQty(available)} kit${available === 1 ? "" : "s"} available` : "None available"}
        </span>
        <span className="stock-split">From its {item.kit.length} product{item.kit.length === 1 ? "" : "s"}&apos; stock</span>
      </div>
    );
  }
  return (
    <div className="stock-cell">
      {isLow(shown) ? (
        <span className="badge badge-red" title={`Alert level: ${formatQty(threshold, unit)}`}>
          <AlertTriangle size={12} />
          {available <= 0 ? "None available" : `${formatQty(available, unit)} available`} · Min {formatQty(threshold)}
        </span>
      ) : (
        <span className="badge badge-green">{formatQty(available, unit)} available</span>
      )}
      <span className="stock-split">
        {formatQty(onHand, unit)} on hand{reserved > 0 ? ` · ${formatQty(reserved)} reserved` : ""}
      </span>
      {view.multi && <OtherStoresStock stock={item.stock} view={view} unit={unit} />}
    </div>
  );
}

/** A group's stock: available across its variants, and how many are low. */
function groupStock(group: ProductGroupEntry, view: StoreView) {
  const shown = group.variants.map((v) => shownStock(v, view));
  return {
    available: shown.reduce((sum, s) => sum + Math.max(s.available, 0), 0),
    onHand: shown.reduce((sum, s) => sum + s.onHand, 0),
    low: shown.filter(isLow).length,
  };
}

function GroupStockCell({ group, view }: { group: ProductGroupEntry; view: StoreView }) {
  const { available, onHand, low } = groupStock(group, view);
  const unit = group.base_uom?.code;
  return (
    <div className="stock-cell">
      {low > 0 ? (
        <span className="badge badge-red">
          <AlertTriangle size={12} /> {low} of {group.variants.length} low
        </span>
      ) : (
        <span className="badge badge-green">{formatQty(available, unit)} available</span>
      )}
      <span className="stock-split">
        {low > 0 ? `${formatQty(available, unit)} available · ` : ""}
        {formatQty(onHand, unit)} on hand in all
      </span>
    </div>
  );
}

/** "per kg" under prices for anything not sold by the piece. */
const perUnit = (code: string | undefined) => (code && code.toLowerCase() !== "pcs" ? ` · per ${code}` : "");

const priceOf = (item: InventoryListItem, view: StoreView) => (view.multi ? priceAt(item, view.currentId) : Number(item.selling_price));

/** "Rs 1,000" or "Rs 1,000 – Rs 1,400". */
function range(values: number[], money: MoneyFormat) {
  if (values.length === 0) return "—";
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? formatMoney(low, money) : `${formatMoney(low, money)} – ${formatMoney(high, money)}`;
}

/** RF-21.2: the main image's thumbnail (variants use their group's), else the category's icon. */
function Thumb({ url, category, group }: { url: string | null; category: CategoryNode | undefined; group?: boolean }) {
  return (
    <div className="mini-product">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- product photo on Supabase Storage
        <img src={url} alt="" loading="lazy" />
      ) : (
        createElement(group ? Layers : categoryIcon(category), { size: 16 })
      )}
    </div>
  );
}

const itemThumb = (item: InventoryListItem) => {
  const main = item.images[0] ?? item.group?.images[0];
  return main ? thumbUrl(main.url) : null;
};
const groupThumb = (group: ProductGroupEntry) => (group.images[0] ? thumbUrl(group.images[0].url) : null);

function Badges({ item }: { item: InventoryListItem }) {
  return (
    <>
      {item.is_kit && <span className="badge badge-blue"><Layers size={11} /> Kit</span>}
      {item.variant_label && <span className="variant-chip">{item.variant_label}</span>}
    </>
  );
}

const entryKey = (e: InventoryEntry) => (e.kind === "group" ? `group-${e.group.id}` : e.item.id);

export function InventoryTable({ result, money, pricesIncludeTax, categories, attributes, units, packsEnabled, fitment, filtered, storeView, view }: Props) {
  const entries = result.rows;
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [switching, startSwitch] = useTransition();
  const [editing, setEditing] = useState<InventoryListItem | null>(null);
  const [editingGroup, setEditingGroup] = useState<ProductGroupEntry | null>(null);
  const [loadingGroup, setLoadingGroup] = useState<string | null>(null);
  const [viewing, setViewing] = useState<InventoryListItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const lowStock = result.lowStock;
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setView = (next: "grouped" | "flat") => {
    const qs = new URLSearchParams(params);
    if (next === "flat") qs.set("view", "flat");
    else qs.delete("view");
    qs.delete("page");
    const s = qs.toString();
    startSwitch(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };

  /** A variant is edited in its group's dialog (loaded when the list shows it as a single SKU). */
  const edit = async (item: InventoryListItem) => {
    if (!item.group_id) {
      setEditing(item);
      return;
    }
    const shown = entries.find((e) => e.kind === "group" && e.group.id === item.group_id);
    if (shown?.kind === "group") {
      setEditingGroup(shown.group);
      return;
    }
    setLoadingGroup(item.group_id);
    try {
      const group = await getProductGroup(item.group_id);
      if (group) setEditingGroup(group);
      else notify.error("Product not found", "It may have been deleted. Refresh the page.");
    } catch {
      notify.error("Couldn't open this product", "Please try again.");
    } finally {
      setLoadingGroup(null);
    }
  };
  const remove = (item: InventoryListItem) => {
    if (item.group_id) {
      notify.error("Variants are removed in their product", `Open ${item.group?.name ?? "its product"} and switch ${item.variant_label ?? "the variant"} off.`);
      return;
    }
    setDeleting({ kind: "item", item });
  };

  const itemCells = (item: InventoryListItem) => {
    const cost = Number(item.cost_price);
    const selling = priceOf(item, storeView);
    const ownPrice = storeView.multi && selling !== Number(item.selling_price);
    return (
      <>
        {fitment && <td><FitmentBadge universal={item.is_universal} /></td>}
        {fitment && <td><VehicleCell universal={item.is_universal} vehicles={item.vehicles} /></td>}
        <td>{formatMoney(cost, money)}</td>
        <td className="amount">
          {formatMoney(selling, money)}
          <span className="price-tax-note">{item.price_includes_tax ? "incl. tax" : "+ tax"}{perUnit(item.base_uom?.code)}</span>
          {ownPrice && <span className="price-tax-note" title={`Product price ${formatMoney(Number(item.selling_price), money)}`}>Store price</span>}
        </td>
        <td><MarginBadge cost={cost} selling={selling} /></td>
        <td><StockCell item={item} view={storeView} /></td>
        <td>
          <div className="row-actions">
            <button type="button" className="icon-button" aria-label={`Edit ${item.name}`} disabled={loadingGroup === item.group_id && item.group_id !== null} onClick={() => void edit(item)}>
              {loadingGroup !== null && loadingGroup === item.group_id ? <Loader2 size={15} className="animate-spin" /> : <Pencil size={15} />}
            </button>
            {!item.group_id && (
              <button type="button" className="icon-button danger" aria-label={`Delete ${item.name}`} onClick={() => remove(item)}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </td>
      </>
    );
  };

  return (
    <section className="card inventory-table-card">
      <div className="inventory-summary">
        <div>
          <h2>{filtered ? "Matching inventory" : "All inventory"}</h2>
          {storeView.multi && <span className="badge badge-blue">Stock at {storeView.currentName}</span>}
          <span className="badge">
            {result.total} {view === "flat" ? (result.total === 1 ? "SKU" : "SKUs") : result.total === 1 ? "product" : "products"}
          </span>
          {lowStock > 0 && (
            <span className="badge badge-red">
              <AlertTriangle size={12} /> {lowStock} low stock
            </span>
          )}
        </div>
        <div className="store-scope view-toggle" role="group" aria-label="Show">
          {switching && <Loader2 size={13} className="animate-spin" />}
          <button type="button" aria-pressed={view === "grouped"} className={view === "grouped" ? "active" : ""} onClick={() => setView("grouped")}>
            Grouped
          </button>
          <button type="button" aria-pressed={view === "flat"} className={view === "flat" ? "active" : ""} onClick={() => setView("flat")}>
            All SKUs
          </button>
        </div>
      </div>

      {result.total === 0 ? (
        <div className="empty-state">
          <span className="header-icon blue"><Package size={18} /></span>
          {filtered ? (
            <>
              <strong>No products match these filters</strong>
              {fitment ? "Try a different search, category, stock level or fitment type." : "Try a different search, category or stock level."}
            </>
          ) : (
            <>
              <strong>No inventory yet</strong>
              Add your first product, or import your whole list from Excel with Import CSV.
              <div className="empty-state-action">
                <button type="button" className="button button-primary" onClick={() => setAdding(true)}>
                  <Plus size={14} /> Add New Product
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="table-wrap desktop-table">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>PRODUCT</th>
                {fitment && <th>FITMENT TYPE</th>}
                {fitment && <th>VEHICLE</th>}
                <th>COST</th>
                <th>SELLING PRICE</th>
                <th>MARGIN</th>
                <th>STOCK</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                if (entry.kind === "item") {
                  const { item } = entry;
                  const category = index.byId.get(item.category_id);
                  const low = isLow(shownStock(item, storeView));
                  return (
                    <tr key={entryKey(entry)} className={low ? "low-stock-row" : undefined}>
                      <td>
                        <div className="inventory-product">
                          <Thumb url={itemThumb(item)} category={category} />
                          <div>
                            <button type="button" className="product-link" onClick={() => setViewing(item)}>
                              {item.name}
                            </button>
                            <span>
                              <span className="mono">{item.sku}</span>
                              <Badges item={item} />
                              {category && <CategoryBadge node={category} label={shortPath(category)} title={fullPath(category)} />}
                            </span>
                          </div>
                        </div>
                      </td>
                      {itemCells(item)}
                    </tr>
                  );
                }
                const { group } = entry;
                const category = index.byId.get(group.category_id);
                const open = expanded.has(group.id);
                const costs = group.variants.map((v) => Number(v.cost_price));
                const prices = group.variants.map((v) => priceOf(v, storeView));
                const low = groupStock(group, storeView).low > 0;
                return (
                  <Fragment key={entryKey(entry)}>
                    <tr className={`group-row${low ? " low-stock-row" : ""}${open ? " open" : ""}`}>
                      <td>
                        <div className="inventory-product">
                          <button type="button" className="icon-button group-toggle" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} the variants of ${group.name}`} onClick={() => toggle(group.id)}>
                            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
                          <Thumb url={groupThumb(group)} category={category} group />
                          <div>
                            <button type="button" className="product-link" onClick={() => toggle(group.id)}>
                              {group.name}
                            </button>
                            <span>
                              <span className="mono">{group.sku_prefix}-…</span>
                              <span className="variant-chip">
                                {group.variants.length} variant{group.variants.length === 1 ? "" : "s"} · {group.options.map((o) => o.name).join(" × ")}
                              </span>
                              {category && <CategoryBadge node={category} label={shortPath(category)} title={fullPath(category)} />}
                            </span>
                          </div>
                        </div>
                      </td>
                      {fitment && <td><FitmentBadge universal={group.is_universal} /></td>}
                      {fitment && <td><VehicleCell universal={group.is_universal} vehicles={group.vehicles} /></td>}
                      <td>{range(costs, money)}</td>
                      <td className="amount">
                        {range(prices, money)}
                        <span className="price-tax-note">{group.price_includes_tax ? "incl. tax" : "+ tax"}{perUnit(group.base_uom?.code)}</span>
                      </td>
                      <td><MarginBadge cost={Number(group.cost_price)} selling={Number(group.selling_price)} /></td>
                      <td><GroupStockCell group={group} view={storeView} /></td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="icon-button" aria-label={`Edit ${group.name}`} onClick={() => setEditingGroup(group)}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="icon-button danger" aria-label={`Delete ${group.name}`} onClick={() => setDeleting(entry)}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open &&
                      group.variants.map((v) => (
                        <tr key={v.id} className={`variant-row${isLow(shownStock(v, storeView)) ? " low-stock-row" : ""}`}>
                          <td>
                            <div className="inventory-product">
                              <div>
                                <button type="button" className="product-link" onClick={() => setViewing(v)}>
                                  {v.variant_label ?? v.name}
                                </button>
                                <span>
                                  <span className="mono">{v.sku}</span>
                                  {v.barcode && <span className="variant-barcode">{v.barcode}</span>}
                                </span>
                              </div>
                            </div>
                          </td>
                          {itemCells(v)}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result.total > 0 && (
        <>
          {/* Phones: one card per product instead of the wide table (CSS swaps them at 768px). */}
          <ul className="mobile-cards" aria-label="Products">
            {entries.map((entry) => {
              if (entry.kind === "item") {
                const { item } = entry;
                return <MobileItemCard key={entryKey(entry)} item={item} category={index.byId.get(item.category_id)} money={money} storeView={storeView} onView={setViewing} onEdit={(i) => void edit(i)} onDelete={remove} />;
              }
              const { group } = entry;
              const category = index.byId.get(group.category_id);
              const stock = groupStock(group, storeView);
              const open = expanded.has(group.id);
              return (
                <li key={entryKey(entry)} className={`mobile-card mobile-group${stock.low ? " low" : ""}`}>
                  <button type="button" className="mobile-card-main" aria-expanded={open} onClick={() => toggle(group.id)}>
                    <span className="mobile-card-top">
                      <span className="variant-chip">{group.variants.length} variants</span>
                      <strong className="amount">{range(group.variants.map((v) => priceOf(v, storeView)), money)}</strong>
                    </span>
                    <span className="mobile-card-title">
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {group.name}
                    </span>
                    <span className="mobile-card-meta">
                      {category && <CategoryBadge node={category} label={shortPath(category)} title={fullPath(category)} />}
                      <span className={`badge ${stock.low ? "badge-red" : "badge-green"}`}>
                        {stock.low > 0 && <AlertTriangle size={11} />}
                        {formatQty(stock.available, group.base_uom?.code)} available{storeView.multi ? " here" : ""}
                        {stock.low > 0 ? ` · ${stock.low} low` : ""}
                      </span>
                    </span>
                  </button>
                  <span className="mobile-card-actions">
                    <button type="button" className="icon-button" aria-label={`Edit ${group.name}`} onClick={() => setEditingGroup(group)}>
                      <Pencil size={16} />
                    </button>
                    <button type="button" className="icon-button danger" aria-label={`Delete ${group.name}`} onClick={() => setDeleting(entry)}>
                      <Trash2 size={16} />
                    </button>
                  </span>
                  {open && (
                    <ul className="mobile-variants">
                      {group.variants.map((v) => {
                        const s = shownStock(v, storeView);
                        return (
                          <li key={v.id}>
                            <button type="button" onClick={() => setViewing(v)}>
                              <span>
                                <strong>{v.variant_label}</strong>
                                <span className="mono">{v.sku}</span>
                              </span>
                              <span>
                                <strong className="amount">{formatMoney(priceOf(v, storeView), money)}</strong>
                                <span className={isLow(s) ? "stock-low" : "in-stock"}>{s.available <= 0 ? "None" : formatQty(s.available, v.base_uom?.code)} available</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <PaginationBar total={result.total} page={result.page} limit={result.limit} noun={view === "flat" ? ["SKU", "SKUs"] : ["product", "products"]} />
        </>
      )}

      <InventoryItemDialog
        open={adding || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false);
            setEditing(null);
          }
        }}
        currency={money.currency}
        pricesIncludeTax={pricesIncludeTax}
        categories={categories}
        attributes={attributes}
        units={units}
        packsEnabled={packsEnabled}
        fitment={fitment}
        storeView={storeView}
        item={editing ?? undefined}
      />
      <ProductGroupDialog
        open={editingGroup !== null}
        onOpenChange={(open) => !open && setEditingGroup(null)}
        currency={money.currency}
        pricesIncludeTax={pricesIncludeTax}
        categories={categories}
        attributes={attributes}
        units={units}
        fitment={fitment}
        storeView={storeView}
        group={editingGroup ?? undefined}
      />
      <DeleteItemDialog entry={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
      <InventoryItemDetails
        item={viewing}
        money={money}
        attributes={attributes}
        fitment={fitment}
        packsEnabled={packsEnabled}
        storeView={storeView}
        categoryLabel={viewing ? (() => { const c = index.byId.get(viewing.category_id); return c ? fullPath(c) : "—"; })() : ""}
        onOpenChange={(open) => !open && setViewing(null)}
        onEdit={(item) => {
          setViewing(null);
          void edit(item);
        }}
      />
    </section>
  );
}

function MobileItemCard({
  item,
  category,
  money,
  storeView,
  onView,
  onEdit,
  onDelete,
}: {
  item: InventoryListItem;
  category: CategoryNode | undefined;
  money: MoneyFormat;
  storeView: StoreView;
  onView: (item: InventoryListItem) => void;
  onEdit: (item: InventoryListItem) => void;
  onDelete: (item: InventoryListItem) => void;
}) {
  const shown = shownStock(item, storeView);
  const available = shown.available;
  const low = isLow(shown) || (item.is_kit && available <= 0);
  return (
    <li className={`mobile-card${low ? " low" : ""}`}>
      <button type="button" className="mobile-card-main" onClick={() => onView(item)} aria-label={`Details for ${item.name}`}>
        <span className="mobile-card-top">
          <span className="mono">{item.sku}</span>
          <strong className="amount">{formatMoney(priceOf(item, storeView), money)}</strong>
        </span>
        <span className="mobile-card-title">{item.name}</span>
        <span className="mobile-card-meta">
          <Badges item={item} />
          {category && <CategoryBadge node={category} label={shortPath(category)} title={fullPath(category)} />}
          <span className={`badge ${low ? "badge-red" : "badge-green"}`}>
            {low && <AlertTriangle size={11} />}
            {available <= 0 ? "None available" : item.is_kit ? `${formatQty(available)} kits available` : `${formatQty(available, item.base_uom?.code)} available`}
            {shown.reserved > 0 ? ` · ${formatQty(shown.reserved)} reserved` : ""}
            {storeView.multi ? " here" : ""}
          </span>
        </span>
      </button>
      <span className="mobile-card-actions">
        <button type="button" className="icon-button" aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}>
          <Pencil size={16} />
        </button>
        {!item.group_id && (
          <button type="button" className="icon-button danger" aria-label={`Delete ${item.name}`} onClick={() => onDelete(item)}>
            <Trash2 size={16} />
          </button>
        )}
      </span>
    </li>
  );
}
