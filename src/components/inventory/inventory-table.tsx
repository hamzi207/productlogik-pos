"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Car, CheckCircle2, Package, Pencil, Plus, Trash2 } from "lucide-react";
import type { Attribute } from "@/lib/attributes";
import { buildCategoryIndex, categoryIcon, fullPath, shortPath, type Category } from "@/lib/categories";
import { formatMoney, formatVehicleGroups, marginPercent, type MoneyFormat } from "@/lib/format";
import type { InventoryPage } from "@/lib/actions/inventory";
import { priceAt, stockAt, type StoreView } from "@/lib/stock";
import type { InventoryListItem } from "@/lib/types/inventory";
import { formatQty, type Unit } from "@/lib/uom";
import { CategoryBadge } from "@/components/categories/category-tree";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { DeleteItemDialog } from "./delete-item-dialog";
import { InventoryItemDetails } from "./inventory-item-details";
import { InventoryItemDialog } from "./inventory-item-dialog";
import { OtherStoresStock } from "./store-stock";

type Props = {
  /** One page of parts + totals for everything matching the filters. */
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
};

function FitmentBadge({ item }: { item: InventoryListItem }) {
  if (item.is_universal) {
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
function VehicleCell({ item }: { item: InventoryListItem }) {
  if (item.is_universal) return <span className="vehicle-cell-all">All vehicles</span>;
  const groups = formatVehicleGroups(item.vehicles);
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
  if (!view.multi) {
    return { onHand: item.quantity_on_hand, reserved: item.reserved_quantity, available: availableOf(item), threshold: item.low_stock_threshold };
  }
  const at = stockAt(item.stock, view.currentId);
  return { ...at, threshold: at.threshold ?? item.low_stock_threshold };
}

function StockCell({ item, view }: { item: InventoryListItem; view: StoreView }) {
  const { onHand, reserved, available, threshold } = shownStock(item, view);
  const low = available <= threshold;
  const unit = item.base_uom?.code;
  return (
    <div className="stock-cell">
      {low ? (
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

/** "per kg" under prices for anything not sold by the piece. */
const perUnit = (item: InventoryListItem) =>
  item.base_uom && item.base_uom.code.toLowerCase() !== "pcs" ? ` · per ${item.base_uom.code}` : "";

export function InventoryTable({ result, money, pricesIncludeTax, categories, attributes, units, packsEnabled, fitment, filtered, storeView }: Props) {
  const items = result.rows;
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const [editing, setEditing] = useState<InventoryListItem | null>(null);
  const [viewing, setViewing] = useState<InventoryListItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryListItem | null>(null);
  const [adding, setAdding] = useState(false);

  const lowStock = result.lowStock;

  return (
    <section className="card inventory-table-card">
      <div className="inventory-summary">
        <div>
          <h2>{filtered ? "Matching inventory" : "All inventory"}</h2>
          {storeView.multi && <span className="badge badge-blue">Stock at {storeView.currentName}</span>}
          <span className="badge">{result.total} {result.total === 1 ? "product" : "products"}</span>
          {lowStock > 0 && (
            <span className="badge badge-red">
              <AlertTriangle size={12} /> {lowStock} low stock
            </span>
          )}
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
              {items.map((item) => {
                const category = index.byId.get(item.category_id);
                const Icon = categoryIcon(category);
                const cost = Number(item.cost_price);
                const selling = storeView.multi ? priceAt(item, storeView.currentId) : Number(item.selling_price);
                const ownPrice = storeView.multi && selling !== Number(item.selling_price);
                const shown = shownStock(item, storeView);
                const low = shown.available <= shown.threshold;
                return (
                  <tr key={item.id} className={low ? "low-stock-row" : undefined}>
                    <td>
                      <div className="inventory-product">
                        <div className="mini-product"><Icon size={16} /></div>
                        <div>
                          <button type="button" className="product-link" onClick={() => setViewing(item)}>
                            {item.name}
                          </button>
                          <span>
                            <span className="mono">{item.sku}</span>
                            {category && <CategoryBadge node={category} label={shortPath(category)} title={fullPath(category)} />}
                          </span>
                        </div>
                      </div>
                    </td>
                    {fitment && <td><FitmentBadge item={item} /></td>}
                    {fitment && <td><VehicleCell item={item} /></td>}
                    <td>{formatMoney(cost, money)}</td>
                    <td className="amount">
                      {formatMoney(selling, money)}
                      <span className="price-tax-note">{item.price_includes_tax ? "incl. tax" : "+ tax"}{perUnit(item)}</span>
                      {ownPrice && <span className="price-tax-note" title={`Product price ${formatMoney(Number(item.selling_price), money)}`}>Store price</span>}
                    </td>
                    <td><MarginBadge cost={cost} selling={selling} /></td>
                    <td><StockCell item={item} view={storeView} /></td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-button" aria-label={`Edit ${item.name}`} onClick={() => setEditing(item)}>
                          <Pencil size={15} />
                        </button>
                        <button type="button" className="icon-button danger" aria-label={`Delete ${item.name}`} onClick={() => setDeleting(item)}>
                          <Trash2 size={15} />
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

      {result.total > 0 && (
        <>
          {/* Phones: one card per product instead of the wide table (CSS swaps them at 768px). */}
          <ul className="mobile-cards" aria-label="Products">
            {items.map((item) => {
              const category = index.byId.get(item.category_id);
              const shown = shownStock(item, storeView);
              const available = shown.available;
              const low = available <= shown.threshold;
              return (
                <li key={item.id} className={`mobile-card${low ? " low" : ""}`}>
                  <button type="button" className="mobile-card-main" onClick={() => setViewing(item)} aria-label={`Details for ${item.name}`}>
                    <span className="mobile-card-top">
                      <span className="mono">{item.sku}</span>
                      <strong className="amount">{formatMoney(storeView.multi ? priceAt(item, storeView.currentId) : Number(item.selling_price), money)}</strong>
                    </span>
                    <span className="mobile-card-title">{item.name}</span>
                    <span className="mobile-card-meta">
                      {category && <CategoryBadge node={category} label={shortPath(category)} title={fullPath(category)} />}
                      <span className={`badge ${low ? "badge-red" : "badge-green"}`}>
                        {low && <AlertTriangle size={11} />}
                        {available <= 0 ? "None available" : `${formatQty(available, item.base_uom?.code)} available`}
                        {shown.reserved > 0 ? ` · ${formatQty(shown.reserved)} reserved` : ""}
                        {storeView.multi ? " here" : ""}
                      </span>
                    </span>
                  </button>
                  <span className="mobile-card-actions">
                    <button type="button" className="icon-button" aria-label={`Edit ${item.name}`} onClick={() => setEditing(item)}>
                      <Pencil size={16} />
                    </button>
                    <button type="button" className="icon-button danger" aria-label={`Delete ${item.name}`} onClick={() => setDeleting(item)}>
                      <Trash2 size={16} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <PaginationBar total={result.total} page={result.page} limit={result.limit} noun={["product", "products"]} />
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
      <DeleteItemDialog item={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
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
          setEditing(item);
        }}
      />
    </section>
  );
}
