"use client";

import { useMemo, useState, useTransition } from "react";
import { PackagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, type ConfirmRequest } from "@/components/quotes/confirm-dialog";
import { SubscriptionDialog as FormDialog, useSubmit } from "@/components/subscription/subscription-dialog";
import { deleteTenantProduct, saveTenantProduct } from "@/lib/actions/admin-products";
import { AttributeFields } from "@/components/categories/attribute-fields";
import type { AdminProduct } from "@/lib/admin-category-data";
import { applicableAttributes, asValues, attributeProblem, mergeAttributeValues, type Attribute, type AttrValues } from "@/lib/attributes";
import { buildCategoryIndex, fullPath, type Category, type CategoryIndex } from "@/lib/categories";
import { notify } from "@/lib/notify";
import { formatQty, type Unit } from "@/lib/uom";

type Props = {
  tenantId: string;
  rows: AdminProduct[];
  total: number;
  /** The organization's visible categories (catalog + own). */
  categories: Category[];
  /** Industry + own attributes, not archived. */
  attributes: Attribute[];
  /** The organization's units of measure (archived ones too). */
  units: Unit[];
  /** Phase 20: the organization's stores, main first (stock is set per store). */
  stores: StoreOption[];
};

type StoreOption = { id: string; name: string; is_main: boolean; is_active: boolean };

const onHandAt = (product: AdminProduct | null, storeId: string) =>
  product?.stock_levels.find((l) => l.store_id === storeId)?.on_hand ?? 0;

const money = (n: number) => n.toLocaleString("en-PK", { maximumFractionDigits: 2 });

function ProductDialog({ tenantId, product, index, attributes, units, stores, onClose }: { tenantId: string; product: AdminProduct | null; index: CategoryIndex; attributes: Attribute[]; units: Unit[]; stores: StoreOption[]; onClose: () => void }) {
  const active = units.filter((u) => !u.is_archived || u.id === product?.base_uom_id);
  const stockStores = stores.filter((s) => s.is_active || onHandAt(product, s.id) > 0);
  const [storeId, setStoreId] = useState(stockStores[0]?.id ?? "");
  const [v, setV] = useState({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    categoryId: product?.category_id ?? "",
    costPrice: String(product?.cost_price ?? ""),
    sellingPrice: String(product?.selling_price ?? ""),
    quantityOnHand: String(onHandAt(product, stockStores[0]?.id ?? "")),
    lowStockThreshold: String(product?.low_stock_threshold ?? "0"),
    priceIncludesTax: product?.price_includes_tax ?? true,
    vendorName: product?.vendor_name ?? "",
    description: product?.description ?? "",
    baseUomId: product?.base_uom_id ?? (active.find((u) => u.code.toLowerCase() === "pcs") ?? active[0])?.id ?? "",
  });
  const [attrs, setAttrs] = useState<AttrValues>(() => asValues(product?.attributes));
  const { busy, error, run } = useSubmit(onClose, product ? "Product saved" : "Product added");
  const fields = applicableAttributes(attributes, index, v.categoryId);
  // Current category stays pickable even if archived since.
  const choices = index.flat.filter((n) => !n.archived || n.id === product?.category_id);
  const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));

  const submit = () =>
    void run(() => {
      const problem = attributeProblem(fields, attrs);
      if (problem) return Promise.resolve({ status: "error" as const, message: problem });
      return saveTenantProduct(
        tenantId,
        {
          name: v.name,
          sku: v.sku,
          categoryId: v.categoryId,
          costPrice: num(v.costPrice),
          sellingPrice: num(v.sellingPrice),
          quantityOnHand: num(v.quantityOnHand),
          lowStockThreshold: num(v.lowStockThreshold),
          priceIncludesTax: v.priceIncludesTax,
          vendorName: v.vendorName,
          description: v.description,
          baseUomId: v.baseUomId,
          attributes: mergeAttributeValues(product?.attributes, fields, attrs),
        },
        product?.id,
        storeId,
      );
    });

  return (
    <FormDialog
      open
      onClose={onClose}
      icon={product ? Pencil : PackagePlus}
      title={product ? `Edit ${product.name}` : "Add a product"}
      description={product && !product.is_universal ? "Vehicle fitment is kept as it is; change it in the shop (Login As)." : "Saved to this organization's inventory."}
      submitLabel="Save"
      busy={busy}
      error={error}
      onSubmit={submit}
    >
      <label className="span-two">
        <span>NAME</span>
        <input autoFocus value={v.name} maxLength={120} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </label>
      <label>
        <span>SKU</span>
        <input value={v.sku} maxLength={40} onChange={(e) => setV({ ...v, sku: e.target.value.toUpperCase() })} />
      </label>
      <label>
        <span>CATEGORY</span>
        <select value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}>
          <option value="">Choose…</option>
          {choices.map((n) => (
            <option key={n.id} value={n.id}>{fullPath(n)}</option>
          ))}
        </select>
      </label>
      <label>
        <span>UNIT</span>
        <select value={v.baseUomId} onChange={(e) => setV({ ...v, baseUomId: e.target.value })}>
          {active.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
          ))}
        </select>
      </label>
      <label>
        <span>COST PRICE</span>
        <input inputMode="decimal" value={v.costPrice} onChange={(e) => setV({ ...v, costPrice: e.target.value })} />
      </label>
      <label>
        <span>SELLING PRICE</span>
        <input inputMode="decimal" value={v.sellingPrice} onChange={(e) => setV({ ...v, sellingPrice: e.target.value })} />
      </label>
      {stockStores.length > 1 && (
        <label>
          <span>STOCK AT</span>
          <select
            value={storeId}
            onChange={(e) => {
              setStoreId(e.target.value);
              setV({ ...v, quantityOnHand: String(onHandAt(product, e.target.value)) });
            }}
          >
            {stockStores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.is_active ? "" : " (switched off)"}</option>
            ))}
          </select>
          <small>Save once per store to change several.</small>
        </label>
      )}
      <label>
        <span>{stockStores.length > 1 ? "STOCK ON HAND THERE" : "STOCK ON HAND"}</span>
        <input inputMode="decimal" value={v.quantityOnHand} onChange={(e) => setV({ ...v, quantityOnHand: e.target.value })} />
      </label>
      <label>
        <span>LOW-STOCK ALERT AT</span>
        <input inputMode="decimal" value={v.lowStockThreshold} onChange={(e) => setV({ ...v, lowStockThreshold: e.target.value })} />
      </label>
      <label>
        <span>VENDOR (OPTIONAL)</span>
        <input value={v.vendorName} maxLength={255} onChange={(e) => setV({ ...v, vendorName: e.target.value })} />
      </label>
      <label className="check-field">
        <input type="checkbox" checked={v.priceIncludesTax} onChange={(e) => setV({ ...v, priceIncludesTax: e.target.checked })} />
        <div>
          <strong>Price includes tax</strong>
        </div>
      </label>
      <label className="span-two">
        <span>DESCRIPTION (OPTIONAL)</span>
        <textarea rows={2} value={v.description} maxLength={500} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </label>
      <AttributeFields fields={fields} values={attrs} onChange={setAttrs} />
    </FormDialog>
  );
}

/** The console's Products tab: one page of an organization's products with add / edit / delete. */
export function TenantProductManager({ tenantId, rows, total, categories, attributes, units, stores }: Props) {
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const unitCode = new Map(units.map((u) => [u.id, u.code]));
  const [dialog, setDialog] = useState<{ product: AdminProduct | null } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = (p: AdminProduct) =>
    setConfirm({
      title: `Delete ${p.name}?`,
      body: <p>Quotations and invoices that used it keep their lines. This can&apos;t be undone.</p>,
      confirmLabel: "Delete",
      icon: <Trash2 size={18} />,
      tone: "danger",
      onConfirm: () =>
        startTransition(async () => {
          const result = await deleteTenantProduct(tenantId, p.id);
          if (result.status === "error") notify.error("Not deleted", result.message);
          else notify.success("Product deleted");
          setConfirm(null);
        }),
    });

  return (
    <>
      <div className="product-toolbar">
        <span className="admin-muted">{total} {total === 1 ? "product" : "products"}</span>
        <button type="button" className="button button-primary" onClick={() => setDialog({ product: null })}>
          <Plus size={14} /> Product
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state"><strong>No products found</strong></div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>PRODUCT</th>
                <th>CATEGORY</th>
                <th className="numeric">COST</th>
                <th className="numeric">PRICE</th>
                <th className="numeric">STOCK</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const cat = index.byId.get(p.category_id);
                const low = p.quantity_on_hand <= p.low_stock_threshold;
                const stock = formatQty(Number(p.quantity_on_hand), unitCode.get(p.base_uom_id));
                const byStore =
                  stores.length > 1
                    ? stores
                        .map((s) => `${s.name}: ${formatQty(onHandAt(p, s.id), unitCode.get(p.base_uom_id))}`)
                        .join("\n")
                    : undefined;
                return (
                  <tr key={p.id}>
                    <td className="primary-cell">
                      <strong>{p.name}</strong>
                      <span className="mono">{p.sku}</span>
                    </td>
                    <td>{cat ? fullPath(cat) : <span className="admin-muted">Hidden or removed category</span>}</td>
                    <td className="numeric">{money(Number(p.cost_price))}</td>
                    <td className="numeric">{money(Number(p.selling_price))}</td>
                    <td className="numeric" title={byStore}>
                      {low ? <span className="badge badge-red">{stock}</span> : stock}
                      {byStore && <span className="admin-muted"> · {stores.length} stores</span>}
                    </td>
                    <td>
                      <div className="row-actions admin-row-actions">
                        <button type="button" className="icon-button" aria-label={`Edit ${p.name}`} title="Edit" onClick={() => setDialog({ product: p })}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="icon-button danger" aria-label={`Delete ${p.name}`} title="Delete" disabled={pending} onClick={() => remove(p)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dialog && <ProductDialog tenantId={tenantId} product={dialog.product} index={index} attributes={attributes} units={units} stores={stores} onClose={() => setDialog(null)} />}
      <ConfirmDialog request={confirm} pending={pending} onOpenChange={(open) => !open && setConfirm(null)} />
    </>
  );
}
