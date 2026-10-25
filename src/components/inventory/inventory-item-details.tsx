"use client";

import { Dialog } from "radix-ui";
import { Package, Pencil, X } from "lucide-react";
import { asValues, attributeText, type Attribute } from "@/lib/attributes";
import { formatMoney, formatVehicleGroups, marginPercent, type MoneyFormat } from "@/lib/format";
import type { StoreView } from "@/lib/stock";
import type { InventoryListItem } from "@/lib/types/inventory";
import { formatQty, unitOptions } from "@/lib/uom";
import { StoreStockTable } from "./store-stock";

type Props = {
  item: InventoryListItem | null;
  money: MoneyFormat;
  /** Attribute definitions; the item's stored values show by label (archived ones too, so nothing is hidden). */
  attributes: Attribute[];
  fitment: boolean;
  /** Settings → Units: packs switched on (packs kept while off are marked as such). */
  packsEnabled: boolean;
  /** Phase 20: with more than one store, stock and store prices show per store. */
  storeView: StoreView;
  /** Full category path, e.g. "Exterior › Wrapping › Tinting Film". */
  categoryLabel: string;
  onOpenChange: (open: boolean) => void;
  onEdit: (item: InventoryListItem) => void;
};

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <span>{label}</span>
      <strong className={mono ? "mono" : undefined}>{value}</strong>
    </div>
  );
}

/**
 * Read-only product details, opened from the product name. The vendor shows
 * here only, not in the inventory table (docs/changes.md §6).
 */
export function InventoryItemDetails({ item, money, attributes, fitment, packsEnabled, storeView, categoryLabel, onOpenChange, onEdit }: Props) {
  const cost = Number(item?.cost_price ?? 0);
  const selling = Number(item?.selling_price ?? 0);
  const margin = marginPercent(cost, selling);
  const available = item ? item.quantity_on_hand - item.reserved_quantity : 0;
  const values = asValues(item?.attributes);
  const unit = item?.base_uom?.code;
  const packs = item ? unitOptions({ ...item, item_uom_conversions: item.conversions }).slice(1) : [];
  const unitName = (id: string | null) => (id ? packs.find((p) => p.id === id)?.code : undefined) ?? unit ?? "—";
  const shownAttributes = attributes.filter((a) => values[a.key] !== undefined);

  return (
    <Dialog.Root open={item !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content className="modal">
            <div className="modal-header">
              <div>
                <span className="header-icon blue"><Package size={18} /></span>
                <div>
                  <Dialog.Title asChild><h2 className="product-details-title">{item?.name}</h2></Dialog.Title>
                  <Dialog.Description asChild>
                    <p><span className="mono">{item?.sku}</span> · {categoryLabel}</p>
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="icon-button" aria-label="Close"><X size={16} /></button>
              </Dialog.Close>
            </div>
            {item && (
              <div className="modal-body">
                <div className="product-details">
                  <Row label="Vendor / supplier" value={item.vendor_name || "—"} />
                  {fitment && (
                    <Row label="Fitment" value={item.is_universal ? "Universal Fit (all vehicles)" : formatVehicleGroups(item.vehicles).join(", ")} />
                  )}
                  {shownAttributes.map((a) => (
                    <Row key={a.id} label={a.label} value={attributeText(a, values[a.key])} />
                  ))}
                  <Row label="Unit" value={unit ?? "—"} />
                  {packs.length > 0 && (
                    <Row
                      label={packsEnabled ? "Packs" : "Packs (switched off in Settings → Units)"}
                      value={packs.map((p) => `1 ${p.code} = ${formatQty(p.factor, unit)} · ${formatMoney(p.price, money)}`).join("\n")}
                    />
                  )}
                  {packs.length > 0 && packsEnabled && <Row label="Buy in / sell in" value={`${unitName(item.purchase_uom_id)} / ${unitName(item.sale_uom_id)}`} />}
                  <Row label={`Cost price (per ${unit ?? "unit"})`} value={formatMoney(cost, money)} />
                  <Row
                    label={`Selling price (per ${unit ?? "unit"})`}
                    value={`${formatMoney(selling, money)} ${item.price_includes_tax ? "(incl. tax)" : "(+ tax)"}`}
                  />
                  <Row label="Margin" value={margin === null ? "—" : `${margin.toFixed(1)}%`} />
                  {storeView.multi && item.store_prices.length > 0 && (
                    <Row
                      label="Store prices"
                      value={item.store_prices
                        .map((p) => `${storeView.stores.find((s) => s.id === p.store_id)?.name ?? "Store"}: ${formatMoney(p.selling_price, money)}`)
                        .join("\n")}
                    />
                  )}
                  <Row label={storeView.multi ? "On hand (all stores)" : "On hand"} value={formatQty(item.quantity_on_hand, unit)} />
                  <Row label={storeView.multi ? "Reserved (all stores)" : "Reserved on quotations"} value={formatQty(item.reserved_quantity, unit)} />
                  <Row label={storeView.multi ? "Available (all stores)" : "Available to sell"} value={formatQty(available, unit)} />
                  <Row label="Low-stock alert at" value={formatQty(item.low_stock_threshold, unit)} />
                </div>
                {storeView.multi && (
                  <div className="product-details-stores">
                    <h3>Stock by store</h3>
                    <StoreStockTable stock={item.stock} view={storeView} unit={unit} />
                  </div>
                )}
                {item.description && <p className="product-details-note">{item.description}</p>}
              </div>
            )}
            <div className="modal-footer">
              <Dialog.Close asChild>
                <button type="button" className="button">Close</button>
              </Dialog.Close>
              {item && (
                <button type="button" className="button button-primary" onClick={() => onEdit(item)}>
                  <Pencil size={14} /> Edit Product
                </button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
