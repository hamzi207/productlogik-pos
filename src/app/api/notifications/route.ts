import { getShopSession } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { formatQty } from "@/lib/uom";
import { getStoreContext } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

export type AlertTone = "red" | "amber" | "blue";
/** One notification: `key` is stable while the situation lasts (used for "seen"). */
export type ShopAlert = { key: string; tone: AlertTone; title: string; detail: string; href: string };
export type AlertsResponse = { alerts: ShopAlert[] };

type Doc = { id: string; number: string; customer: string; days: number; balance?: number; total?: number };
type Stock = { id: string; name: string; sku: string; free: number; threshold: number; unit: string | null };
type Raw = { lowStock: Stock[]; overdue: Doc[]; dueSoon: Doc[]; expiring: Doc[]; expired: Doc[] };

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** Category request outcomes stay in the bell this long after the superadmin decides (Phase 18). */
const REQUEST_RESULT_DAYS = 14;

/**
 * The notification bell's alerts, worked out live by public.shop_alerts() (RLS: caller's shop only), plus
 * the outcome of the caller's own category requests from the last two weeks.
 */
export async function GET() {
  const [session, supabase, stores] = await Promise.all([getShopSession(), createClient(), getStoreContext()]);
  const since = new Date(Date.now() - REQUEST_RESULT_DAYS * 86_400_000).toISOString();
  const [{ data, error }, { data: requests, error: requestError }] = await Promise.all([
    // Phase 20: the current store's due invoices, expiring quotations and low stock.
    supabase.rpc("shop_alerts", stores.multi ? { p_store_id: stores.current.id } : {}),
    supabase
      .from("category_requests")
      .select("id, name, status, resolution_note, resolved_at")
      .eq("requested_by", session.userId)
      .neq("status", "pending")
      .gte("resolved_at", since)
      .order("resolved_at", { ascending: false })
      .limit(10),
  ]);
  if (requestError) console.error("category request alerts failed:", requestError.message);
  if (error) {
    console.error("shop_alerts failed:", error.message);
    return Response.json({ error: "Couldn't load notifications." }, { status: 500 });
  }
  const r = data as unknown as Raw;
  const money = (n: number) => formatMoney(Number(n), session.tenant.money);

  const alerts: ShopAlert[] = [
    ...(requests ?? []).map((q) => {
      const approved = q.status !== "rejected";
      const note = q.resolution_note ? ` · “${q.resolution_note}”` : "";
      return {
        key: `request:${q.id}:${approved ? "approved" : "rejected"}`,
        tone: approved ? ("blue" as const) : ("amber" as const),
        title: approved ? `“${q.name}” was added to your categories` : `Your request for “${q.name}” was declined`,
        detail: (approved ? "Category request approved" : "Category request") + note,
        href: "/settings/categories",
      };
    }),
    ...r.overdue.map((d) => ({
      key: `overdue:${d.id}`,
      tone: "red" as const,
      title: `${d.number} is overdue`,
      detail: `${d.customer} · ${money(d.balance ?? 0)} unpaid · ${days(d.days)} late`,
      href: `/invoices/${d.id}`,
    })),
    ...r.lowStock.map((s) => ({
      key: `stock:${s.id}:${s.free <= 0 ? "out" : "low"}`,
      tone: s.free <= 0 ? ("red" as const) : ("amber" as const),
      title: s.free <= 0 ? `${s.name} is out of stock` : `${s.name} is running low`,
      detail: `${s.sku} · ${s.free <= 0 ? "none available" : `${formatQty(s.free, s.unit)} available`} (low-stock level ${formatQty(s.threshold, s.unit)})`,
      href: `/inventory?q=${encodeURIComponent(s.sku)}`,
    })),
    ...r.dueSoon.map((d) => ({
      key: `due:${d.id}`,
      tone: "amber" as const,
      title: d.days === 0 ? `${d.number} is due today` : `${d.number} is due in ${days(d.days)}`,
      detail: `${d.customer} · ${money(d.balance ?? 0)} unpaid`,
      href: `/invoices/${d.id}`,
    })),
    ...r.expired.map((d) => ({
      key: `expired:${d.id}`,
      tone: "amber" as const,
      title: `${d.number} expired ${days(d.days)} ago`,
      detail: `${d.customer} · still reserving stock: invoice, cancel or move it to drafts`,
      href: `/quotations/${d.id}`,
    })),
    ...r.expiring.map((d) => ({
      key: `expiring:${d.id}`,
      tone: "blue" as const,
      title: d.days === 0 ? `${d.number} expires today` : `${d.number} expires in ${days(d.days)}`,
      detail: `${d.customer} · ${money(d.total ?? 0)}`,
      href: `/quotations/${d.id}`,
    })),
  ];
  return Response.json({ alerts } satisfies AlertsResponse);
}
