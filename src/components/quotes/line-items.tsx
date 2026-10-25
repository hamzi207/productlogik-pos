"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ArrowDown, ArrowUp, Minus, Plus, Trash2 } from "lucide-react";
import { formatMoney, type MoneyFormat } from "@/lib/format";
import { notify } from "@/lib/notify";
import { lineAmounts, round2, unitDiscount, type DiscountType } from "@/lib/quote-math";
import { bestElsewhere, SINGLE_DOCUMENT_STORE, type DocumentStores } from "@/lib/stock";
import type { PickerItem } from "@/lib/types/quote";
import { fitsDecimals, formatQty, stepFor, type UnitOption } from "@/lib/uom";
import { LineSearch, type CategoryChip } from "./line-search";
import { MobileSheet } from "./mobile-sheet";

/** One line in the builder. `key` is local only (React list key). */
export type BuilderLine = {
  key: string;
  /** Inventory part, or null for a custom item that isn't in inventory. */
  itemId: string | null;
  sku: string | null;
  description: string;
  /** Older labour lines; treated like custom items. */
  isLabor: boolean;
  quantity: number;
  /** Inventory parts: the catalogue price (read-only). Custom items: as entered. */
  unitPrice: number;
  priceIncludesTax: boolean;
  /** Per unit: % of the unit price or a flat amount. */
  discountType: DiscountType;
  discountValue: number;
  /** Base units this part line can use: available stock (+ what a saved line already holds). Null for custom items. */
  stock: number | null;
  /** Parts: the unit the line is sold in (base unit or a pack, Phase 19). Null for custom items. */
  uomId: string | null;
  uomLabel: string | null;
  /** Base units in one of this line's unit. */
  uomFactor: number;
  /** Decimal places the quantity may have in this unit. */
  uomDecimals: number;
  /** Units a part line can switch to (base first); empty for custom items. */
  units: UnitOption[];
  /** Phase 20: the store whose stock the line uses; null = the document's store. */
  sourceStoreId: string | null;
  /** What the line could use in each store (store id → base units); null for custom items. */
  storeStock: Record<string, number> | null;
};

type Props = {
  lines: BuilderLine[];
  onChange: Dispatch<SetStateAction<BuilderLine[]>>;
  onAdd: (item: PickerItem) => void;
  onAddCustom: (description: string) => void;
  money: MoneyFormat;
  readOnly: boolean;
  /** Main categories, for the phone search's filter chips. */
  categories: CategoryChip[];
  /** The product search also matches linked vehicles (Vehicle Fitment module on). */
  vehicleSearch: boolean;
  /** Phase 20: the document's store and what its lines may do. */
  stores?: DocumentStores;
};

const numberValue = (n: number) => (Number.isFinite(n) ? n : "");

/** Quantity after a +/− tap: parts in whole-number units drop any fraction; custom items and kg / litres keep it. */
function stepQuantity(line: BuilderLine, by: 1 | -1) {
  const qty = Number.isFinite(line.quantity) ? line.quantity : 0;
  const base = line.itemId === null || line.uomDecimals > 0 ? qty : Math.floor(qty);
  return Math.max(1, Math.round((base + by) * 1000) / 1000);
}

/** Switching a part to another unit: its price, and a quantity that fits the unit's decimals. A flat discount resets. */
function unitPatch(line: BuilderLine, id: string): Partial<BuilderLine> {
  const unit = line.units.find((u) => u.id === id);
  if (!unit) return {};
  const qty = Number.isFinite(line.quantity) ? line.quantity : 1;
  return {
    uomId: unit.id,
    uomLabel: unit.code,
    uomFactor: unit.factor,
    uomDecimals: unit.decimals,
    unitPrice: unit.price,
    quantity: fitsDecimals(qty, unit.decimals) ? qty : Math.max(1, Math.round(qty)),
    ...(line.discountType === "amount" ? { discountValue: 0 } : {}),
  };
}

/** Over the stock it can use? Stock is in base units; the line may be in packs. */
const isShort = (line: BuilderLine) => line.itemId !== null && line.stock !== null && line.quantity * line.uomFactor > line.stock + 1e-9;

/** "Only 4 pcs available" / "None available"; with stores: "Only 2 here · 15 at Store B". */
function shortLabel(line: BuilderLine, stores: DocumentStores) {
  const unit = line.units[0]?.code;
  if (!stores.multi) return line.stock! <= 0 ? "None available" : `Only ${formatQty(line.stock!, unit)} available`;
  const source = line.sourceStoreId ?? stores.docStoreId;
  const where = source === stores.docStoreId ? "here" : `at ${stores.names[source] ?? "that store"}`;
  const head = line.stock! <= 0 ? `None ${where}` : `Only ${formatQty(line.stock!, unit)} ${where}`;
  const other = bestElsewhere(line.storeStock, source);
  return other ? `${head} · ${formatQty(other.available, unit)} at ${stores.names[other.storeId] ?? "another store"}` : head;
}

/** Switching the store a line takes its stock from. */
const sourcePatch = (line: BuilderLine, storeId: string, stores: DocumentStores): Partial<BuilderLine> => ({
  sourceStoreId: storeId === stores.docStoreId ? null : storeId,
  stock: line.storeStock?.[storeId] ?? 0,
});

/**
 * "From: Store B" for a part line: a picker when the organization allows selling other stores' stock,
 * else (a line saved from another store earlier) a label. Nothing with one store.
 */
function SourceControl({ line, stores, readOnly, onChange, className = "line-source-select" }: { line: BuilderLine; stores: DocumentStores; readOnly: boolean; onChange: (patch: Partial<BuilderLine>) => void; className?: string }) {
  if (!stores.multi || line.itemId === null) return null;
  const source = line.sourceStoreId ?? stores.docStoreId;
  if (!stores.crossStore || readOnly) {
    return source === stores.docStoreId ? null : <span className="line-tag line-source">From {stores.names[source] ?? "another store"}</span>;
  }
  const choices = stores.active.includes(source) ? stores.active : [source, ...stores.active];
  const unit = line.units[0]?.code;
  return (
    <select className={className} value={source} onChange={(e) => onChange(sourcePatch(line, e.target.value, stores))} aria-label="Take stock from">
      {choices.map((id) => (
        <option key={id} value={id}>
          {id === stores.docStoreId ? "From this store" : `From ${stores.names[id] ?? "another store"}`} · {formatQty(line.storeStock?.[id] ?? 0, unit)}
        </option>
      ))}
    </select>
  );
}

/** The unit picker for a part line (a label when it has only one unit). */
function UnitControl({ line, readOnly, onChange, className = "line-unit-select" }: { line: BuilderLine; readOnly: boolean; onChange: (patch: Partial<BuilderLine>) => void; className?: string }) {
  if (line.itemId === null) return null;
  const known = line.units.some((u) => u.id === line.uomId);
  if (line.units.length <= 1 && known) return line.uomLabel ? <span className="line-unit-label">{line.uomLabel}</span> : null;
  return (
    <select
      className={className}
      value={line.uomId ?? ""}
      disabled={readOnly}
      onChange={(e) => onChange(unitPatch(line, e.target.value))}
      aria-label="Unit"
      aria-invalid={!known || undefined}
    >
      {/* A unit removed from the product since: still shown, but it has to change before saving. */}
      {!known && <option value={line.uomId ?? ""}>{line.uomLabel ?? "unit"} (removed)</option>}
      {line.units.map((u) => (
        <option key={u.id} value={u.id}>{u.factor === 1 ? u.code : `${u.code} (${formatQty(u.factor, line.units[0]?.code)})`}</option>
      ))}
    </select>
  );
}

/** A typed sale price always becomes a flat discount. */
function salePricePatch(line: BuilderLine, next: number): Partial<BuilderLine> {
  return { discountType: "amount", discountValue: Number.isFinite(next) ? round2((line.unitPrice || 0) - next) : Number.NaN };
}

const salePrice = (line: BuilderLine) => round2(line.unitPrice - unitDiscount(line));

/**
 * Line items with the search box on top. Columns: qty, unit price (fixed for
 * inventory parts), discount (% or Rs.), sale price, line total. Editing the
 * discount updates the sale price; editing the sale price sets a flat
 * (Rs.) discount. Line total = qty × sale price.
 * Below 768px the table becomes touch cards; tapping one opens an edit sheet.
 */
export function LineItems({ lines, onChange, onAdd, onAddCustom, money, readOnly, categories, vehicleSearch, stores = SINGLE_DOCUMENT_STORE }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const update = (key: string, patch: Partial<BuilderLine>) =>
    onChange((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  /** Removes at once; the toast's Undo puts the line back where it was. */
  const remove = (key: string) => {
    const index = lines.findIndex((l) => l.key === key);
    const line = lines[index];
    if (!line) return;
    onChange((prev) => prev.filter((l) => l.key !== key));
    setEditing(null);
    notify.undo(`Removed ${line.description || "custom item"}`, () =>
      onChange((prev) => (prev.some((l) => l.key === key) ? prev : [...prev.slice(0, index), line, ...prev.slice(index)])),
    );
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...lines];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };
  const addedIds = new Set(lines.flatMap((l) => (l.itemId ? [l.itemId] : [])));
  const editLine = lines.find((l) => l.key === editing) ?? null;

  return (
    <section className="card doc-lines">
      <div className="card-header">
        <div>
          <h2>Line items</h2>
          <p>
            {lines.length === 0
              ? "Search for a product to add it, or add a custom item that isn't in your inventory."
              : `${lines.length} ${lines.length === 1 ? "line" : "lines"}`}
          </p>
        </div>
      </div>
      {!readOnly && <LineSearch money={money} addedIds={addedIds} onAdd={onAdd} onAddCustom={onAddCustom} categories={categories} vehicleSearch={vehicleSearch} stores={stores} />}

      {lines.length > 0 && (
        <div className="doc-table" role="table" aria-label="Line items">
          <div className="doc-row doc-head" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">ITEM</span>
            <span role="columnheader">QTY</span>
            <span role="columnheader">UNIT PRICE</span>
            <span role="columnheader">DISCOUNT</span>
            <span role="columnheader">SALE PRICE</span>
            <span role="columnheader">TOTAL</span>
            <span role="columnheader"><span className="sr-only">Actions</span></span>
          </div>
          {lines.map((line, i) => {
            const custom = line.itemId === null;
            const amounts = lineAmounts(line);
            const sale = salePrice(line);
            const short = isShort(line);
            return (
              <div className="doc-row" role="row" key={line.key}>
                <span className="doc-index">
                  {i + 1}
                  {!readOnly && (
                    <span className="line-move">
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp size={10} />
                      </button>
                      <button type="button" aria-label="Move down" disabled={i === lines.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown size={10} />
                      </button>
                    </span>
                  )}
                </span>

                <div className="line-desc">
                  {custom ? (
                    <>
                      <input
                        className="line-input"
                        value={line.description}
                        onChange={(e) => update(line.key, { description: e.target.value })}
                        placeholder="Describe the item or service"
                        aria-label="Custom item description"
                        maxLength={300}
                        readOnly={readOnly}
                      />
                      <span className="line-tag">Custom item · not in inventory</span>
                    </>
                  ) : (
                    <>
                      <strong className="product-title" title={line.description}>{line.description}</strong>
                      <span className="mono">{line.sku ?? "Removed from inventory"}</span>
                      <SourceControl line={line} stores={stores} readOnly={readOnly} onChange={(patch) => update(line.key, patch)} />
                      {short && <span className="stock-low">{shortLabel(line, stores)}</span>}
                    </>
                  )}
                </div>

                {custom ? (
                  <input
                    className="line-input number"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="any"
                    value={numberValue(line.quantity)}
                    onChange={(e) => update(line.key, { quantity: e.target.valueAsNumber })}
                    aria-label="Quantity"
                    readOnly={readOnly}
                  />
                ) : (
                  <div className="line-qty">
                    <div className="stepper">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        disabled={readOnly || line.quantity <= 1}
                        onClick={() => update(line.key, { quantity: stepQuantity(line, -1) })}
                      >
                        <Minus size={11} />
                      </button>
                      <input
                        type="number"
                        inputMode={line.uomDecimals > 0 ? "decimal" : "numeric"}
                        min={stepFor(line.uomDecimals)}
                        step={stepFor(line.uomDecimals)}
                        value={numberValue(line.quantity)}
                        onChange={(e) => update(line.key, { quantity: e.target.valueAsNumber })}
                        aria-label="Quantity"
                        readOnly={readOnly}
                      />
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        disabled={readOnly}
                        onClick={() => update(line.key, { quantity: stepQuantity(line, 1) })}
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                    <UnitControl line={line} readOnly={readOnly} onChange={(patch) => update(line.key, patch)} />
                  </div>
                )}

                {custom ? (
                  <input
                    className="line-input number"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={numberValue(line.unitPrice)}
                    onChange={(e) => update(line.key, { unitPrice: e.target.valueAsNumber })}
                    aria-label="Unit price"
                    readOnly={readOnly}
                  />
                ) : (
                  <span className="line-unit" title="Price from inventory">
                    {formatMoney(line.unitPrice, money)}
                    {line.uomLabel && line.units.length > 1 && <small className="line-per-unit">per {line.uomLabel}</small>}
                  </span>
                )}

                <div className={`line-discount${amounts.invalid ? " invalid" : ""}`}>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => update(line.key, { discountType: line.discountType === "percent" ? "amount" : "percent", discountValue: 0 })}
                    aria-label={`Discount in ${line.discountType === "percent" ? "percent" : money.currency}; click to switch`}
                    title="Switch between % and a flat amount per unit"
                  >
                    {line.discountType === "percent" ? "%" : money.currency}
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max={line.discountType === "percent" ? 100 : line.unitPrice}
                    step="0.01"
                    value={numberValue(line.discountValue)}
                    onChange={(e) => update(line.key, { discountValue: e.target.valueAsNumber })}
                    aria-label="Discount per unit"
                    aria-invalid={amounts.invalid || undefined}
                    readOnly={readOnly}
                  />
                </div>

                <input
                  className={`line-input number${amounts.invalid ? " invalid" : ""}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={Number.isFinite(sale) && Number.isFinite(line.discountValue) ? sale : ""}
                  onChange={(e) => update(line.key, salePricePatch(line, e.target.valueAsNumber))}
                  aria-label="Sale price"
                  aria-invalid={amounts.invalid || undefined}
                  readOnly={readOnly}
                />

                <strong className="amount line-total">{formatMoney(amounts.net, money)}</strong>

                {readOnly ? (
                  <span />
                ) : (
                  <button type="button" className="icon-button danger" aria-label={`Remove ${line.description || "line"}`} onClick={() => remove(line.key)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---- Phones: one touch card per line ---- */}
      {lines.length > 0 && (
        <ul className="mobile-lines" aria-label="Line items">
          {lines.map((line) => (
            <MobileLineCard
              key={line.key}
              line={line}
              money={money}
              stores={stores}
              readOnly={readOnly}
              onStep={(by) => update(line.key, { quantity: stepQuantity(line, by) })}
              onEdit={() => setEditing(line.key)}
              onRemove={() => remove(line.key)}
            />
          ))}
        </ul>
      )}

      {editLine && (
        <LineEditSheet
          line={editLine}
          money={money}
          stores={stores}
          onClose={() => setEditing(null)}
          onUpdate={(patch) => update(editLine.key, patch)}
          onRemove={() => remove(editLine.key)}
        />
      )}
    </section>
  );
}

/** "−10%" / "−Rs. 50 each" for the card's price line. */
function discountLabel(line: BuilderLine, money: MoneyFormat) {
  const value = Number.isFinite(line.discountValue) ? line.discountValue : 0;
  if (value === 0) return null;
  return line.discountType === "percent" ? `−${value}%` : `−${formatMoney(value, money)} each`;
}

function MobileLineCard({
  line,
  money,
  stores,
  readOnly,
  onStep,
  onEdit,
  onRemove,
}: {
  line: BuilderLine;
  money: MoneyFormat;
  stores: DocumentStores;
  readOnly: boolean;
  onStep: (by: 1 | -1) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const custom = line.itemId === null;
  const amounts = lineAmounts(line);
  const short = isShort(line);
  const discount = discountLabel(line, money);
  const details = (
    <>
      <span className="mobile-card-top">
        <strong className="mobile-card-title">{line.description || (custom ? "Custom item (tap to describe)" : "Product")}</strong>
        <strong className="amount">{formatMoney(amounts.net, money)}</strong>
      </span>
      <span className="mobile-line-meta">
        {custom ? <span className="line-tag">Custom item</span> : <span className="mono">{line.sku ?? "Removed from inventory"}</span>}
        <span>
          {formatMoney(line.unitPrice || 0, money)}
          {discount && <span className="discount-amount"> {discount}</span>}
        </span>
        {amounts.invalid && <span className="stock-out">Discount too large</span>}
        {stores.multi && line.sourceStoreId && <span className="line-tag line-source">From {stores.names[line.sourceStoreId] ?? "another store"}</span>}
        {short && <span className="stock-low">{shortLabel(line, stores)}</span>}
      </span>
    </>
  );

  return (
    <li className={`mobile-line-card${amounts.invalid ? " invalid" : ""}`}>
      {readOnly ? (
        <div className="mobile-line-main">{details}</div>
      ) : (
        <button type="button" className="mobile-line-main" onClick={onEdit} aria-label={`Edit ${line.description || "custom item"}`}>
          {details}
        </button>
      )}
      <div className="mobile-line-controls">
        <div className="touch-stepper" role="group" aria-label="Quantity">
          <button type="button" aria-label="Decrease quantity" disabled={readOnly || line.quantity <= 1} onClick={() => onStep(-1)}>
            <Minus size={18} />
          </button>
          <span aria-live="polite">{Number.isFinite(line.quantity) ? formatQty(line.quantity, custom ? null : line.uomLabel) : "—"}</span>
          <button type="button" aria-label="Increase quantity" disabled={readOnly} onClick={() => onStep(1)}>
            <Plus size={18} />
          </button>
        </div>
        {!readOnly && (
          <button type="button" className="icon-button danger touch-delete" aria-label={`Remove ${line.description || "line"}`} onClick={onRemove}>
            <Trash2 size={18} />
          </button>
        )}
      </div>
    </li>
  );
}

/** Bottom sheet for one line on phones: quantity, price (custom items), discount, sale price. Changes apply as typed. */
function LineEditSheet({
  line,
  money,
  stores,
  onClose,
  onUpdate,
  onRemove,
}: {
  line: BuilderLine;
  money: MoneyFormat;
  stores: DocumentStores;
  onClose: () => void;
  onUpdate: (patch: Partial<BuilderLine>) => void;
  onRemove: () => void;
}) {
  const custom = line.itemId === null;
  const amounts = lineAmounts(line);
  const sale = salePrice(line);

  return (
    <MobileSheet
      open
      onOpenChange={(open) => !open && onClose()}
      variant="bottom"
      title={custom ? "Custom item" : line.description}
      description="Change the quantity, price or discount for this line."
      footer={
        <>
          <button type="button" className="button button-ghost danger" onClick={onRemove}>
            <Trash2 size={16} /> Remove
          </button>
          <button type="button" className="button button-primary sheet-done" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="line-edit">
        {custom && (
          <label className="field">
            <span className="field-label">DESCRIPTION</span>
            <input
              className="field-input"
              value={line.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Describe the item or service"
              maxLength={300}
            />
          </label>
        )}
        {!custom && <p className="line-edit-sku mono">{line.sku ?? "Removed from inventory"}</p>}

        <div className="line-edit-row">
          <span className="field-label">QUANTITY</span>
          <div className="touch-stepper">
            <button type="button" aria-label="Decrease quantity" disabled={line.quantity <= 1} onClick={() => onUpdate({ quantity: stepQuantity(line, -1) })}>
              <Minus size={18} />
            </button>
            <input
              type="number"
              inputMode={custom || line.uomDecimals > 0 ? "decimal" : "numeric"}
              min={custom ? "0.01" : stepFor(line.uomDecimals)}
              step={custom ? "any" : stepFor(line.uomDecimals)}
              value={numberValue(line.quantity)}
              onChange={(e) => onUpdate({ quantity: e.target.valueAsNumber })}
              aria-label="Quantity"
            />
            <button type="button" aria-label="Increase quantity" onClick={() => onUpdate({ quantity: stepQuantity(line, 1) })}>
              <Plus size={18} />
            </button>
          </div>
        </div>

        {!custom && (line.units.length > 1 || !line.units.some((u) => u.id === line.uomId)) && (
          <label className="line-edit-row">
            <span className="field-label">UNIT</span>
            <UnitControl line={line} readOnly={false} onChange={onUpdate} className="field-input" />
          </label>
        )}

        {!custom && stores.multi && stores.crossStore && (
          <label className="line-edit-row">
            <span className="field-label">STOCK FROM</span>
            <SourceControl line={line} stores={stores} readOnly={false} onChange={onUpdate} className="field-input" />
          </label>
        )}
        {!custom && isShort(line) && <p className="field-note stock-low">{shortLabel(line, stores)}</p>}

        <label className="line-edit-row">
          <span className="field-label">{!custom && line.uomLabel ? `PRICE PER ${line.uomLabel.toUpperCase()}` : "UNIT PRICE"}</span>
          {custom ? (
            <input
              className="field-input number"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={numberValue(line.unitPrice)}
              onChange={(e) => onUpdate({ unitPrice: e.target.valueAsNumber })}
            />
          ) : (
            <strong title="Price from inventory">{formatMoney(line.unitPrice, money)}</strong>
          )}
        </label>

        <div className="line-edit-row">
          <span className="field-label">DISCOUNT PER UNIT</span>
          <div className="line-edit-discount">
            <div className="segmented">
              {(["percent", "amount"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={line.discountType === type ? "active" : ""}
                  aria-pressed={line.discountType === type}
                  onClick={() => line.discountType !== type && onUpdate({ discountType: type, discountValue: 0 })}
                >
                  {type === "percent" ? "%" : money.currency}
                </button>
              ))}
            </div>
            <input
              className="field-input number"
              type="number"
              inputMode="decimal"
              min="0"
              max={line.discountType === "percent" ? 100 : line.unitPrice}
              step="0.01"
              value={numberValue(line.discountValue)}
              onChange={(e) => onUpdate({ discountValue: e.target.valueAsNumber })}
              aria-label="Discount per unit"
              aria-invalid={amounts.invalid || undefined}
            />
          </div>
        </div>

        <label className="line-edit-row">
          <span className="field-label">SALE PRICE</span>
          <input
            className={`field-input number${amounts.invalid ? " invalid" : ""}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={Number.isFinite(sale) && Number.isFinite(line.discountValue) ? sale : ""}
            onChange={(e) => onUpdate(salePricePatch(line, e.target.valueAsNumber))}
            aria-invalid={amounts.invalid || undefined}
          />
        </label>
        {amounts.invalid && <p className="field-error">The discount is more than the unit price.</p>}

        <div className="line-edit-total">
          <span>Line total</span>
          <strong>{formatMoney(amounts.net, money)}</strong>
        </div>
      </div>
    </MobileSheet>
  );
}
