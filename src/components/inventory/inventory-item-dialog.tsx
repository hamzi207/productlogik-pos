"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "radix-ui";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, Car, CheckCircle2, Loader2, Package, Plus, Save, Trash2, Wand2, X } from "lucide-react";
import { createInventoryItem, updateInventoryItem } from "@/lib/actions/inventory";
import { formatMoney, marginPercent } from "@/lib/format";
import { notify } from "@/lib/notify";
import { applicableAttributes, asValues, attributeProblem, mergeAttributeValues, type Attribute } from "@/lib/attributes";
import { buildCategoryIndex, skuPrefix, type Category, type CategoryIndex } from "@/lib/categories";
import { AttributeFields } from "@/components/categories/attribute-fields";
import { useDiscardGuard } from "@/components/shared/discard-changes";
import { ModalSheet } from "@/components/shared/modal-sheet";
import type { FitmentVehicle, InventoryListItem } from "@/lib/types/inventory";
import { formatNumber, formatQty, stepFor, type Unit } from "@/lib/uom";
import { inventoryItemSchema, type InventoryItemInput } from "@/lib/validations/inventory.schema";
import { CategoryPicker } from "./category-picker";
import { YmmCompatibilitySelector } from "./ymm-compatibility-selector";

/** New products start in pieces, else the first active unit. */
function defaultUnit(units: Unit[]) {
  const active = units.filter((u) => !u.is_archived);
  return active.find((u) => u.code.toLowerCase() === "pcs") ?? active[0];
}

/** Prefix from the main category (e.g. EXT-4K9QZ). */
function generateSku(index: CategoryIndex, categoryId: string | undefined) {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${skuPrefix(categoryId ? index.byId.get(categoryId) : undefined)}-${suffix}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  /** Shop default for "price includes tax" on new items. */
  pricesIncludeTax: boolean;
  categories: Category[];
  /** The organization's attribute definitions (RF-18.1); the dialog shows the ones for the chosen category. */
  attributes: Attribute[];
  /** Vehicle Fitment module on: shows Universal Fit / Vehicle Specific and the vehicle picker. */
  fitment: boolean;
  /** The organization's units of measure (Phase 19), archived ones too. */
  units: Unit[];
  /** Settings → Units: packs switched on (else the Packs section is hidden and existing packs kept as they are). */
  packsEnabled: boolean;
  /** Edit this item; omit to create a new one. */
  item?: InventoryListItem;
};

/** Add / edit inventory product modal (Figma "Add inventory product"). */
export function InventoryItemDialog({ open, onOpenChange, currency, pricesIncludeTax, categories, attributes, fitment, units, packsEnabled, item }: Props) {
  // Closing with unsaved edits asks first (Cancel, X, Escape, clicking outside).
  const guard = useDiscardGuard({
    onOpenChange,
    discardedNote: item ? `${item.name} was left as it was saved.` : "The new product was not added to inventory.",
  });
  return (
    <>
      <Dialog.Root open={open} onOpenChange={guard.requestOpenChange}>
        <ModalSheet>
          {/* Remount per open so the form always starts from the item's current values. */}
          {open && (
            <ItemForm
              key={item?.id ?? "new"}
              item={item}
              currency={currency}
              pricesIncludeTax={pricesIncludeTax}
              categories={categories}
              attributes={attributes}
              fitment={fitment}
              units={units}
              packsEnabled={packsEnabled}
              onDirtyChange={guard.setDirty}
              onDone={guard.close}
            />
          )}
        </ModalSheet>
      </Dialog.Root>
      {guard.prompt}
    </>
  );
}

function ItemForm({
  item,
  currency,
  pricesIncludeTax,
  categories,
  attributes,
  fitment,
  units,
  packsEnabled,
  onDirtyChange,
  onDone,
}: {
  item?: InventoryListItem;
  currency: string;
  pricesIncludeTax: boolean;
  categories: Category[];
  attributes: Attribute[];
  fitment: boolean;
  units: Unit[];
  packsEnabled: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onDone: () => void;
}) {
  const isEdit = Boolean(item);
  const [serverError, setServerError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<FitmentVehicle[]>(item?.vehicles ?? []);
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<InventoryItemInput>({
    resolver: zodResolver(inventoryItemSchema),
    defaultValues: item
      ? {
          sku: item.sku,
          name: item.name,
          description: item.description ?? "",
          vendorName: item.vendor_name ?? "",
          categoryId: item.category_id,
          costPrice: Number(item.cost_price),
          sellingPrice: Number(item.selling_price),
          quantityOnHand: item.quantity_on_hand,
          lowStockThreshold: item.low_stock_threshold,
          baseUomId: item.base_uom_id,
          conversions: item.conversions.map((c) => ({
            uomId: c.uom_id,
            factor: c.factor,
            sellingPrice: c.selling_price,
            barcode: c.barcode ?? "",
          })),
          purchaseUomId: item.purchase_uom_id,
          saleUomId: item.sale_uom_id,
          priceIncludesTax: item.price_includes_tax,
          isUniversal: item.is_universal,
          vehicleIds: item.vehicles.map((v) => v.id),
          attributes: asValues(item.attributes),
        }
      : {
          sku: "",
          name: "",
          description: "",
          vendorName: "",
          quantityOnHand: 0,
          lowStockThreshold: 5,
          baseUomId: defaultUnit(units)?.id,
          conversions: [],
          purchaseUomId: null,
          saleUomId: null,
          priceIncludesTax: pricesIncludeTax,
          isUniversal: true,
          vehicleIds: [],
          attributes: {},
        },
  });

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  const { fields: conversionFields, append: addConversion, remove: removeConversion } = useFieldArray({ control, name: "conversions" });

  const [cost, selling, isUniversal, categoryId, attributeValues, baseUomId, conversions] = useWatch({
    control,
    name: ["costPrice", "sellingPrice", "isUniversal", "categoryId", "attributes", "baseUomId", "conversions"],
  });
  const unitById = new Map(units.map((u) => [u.id, u]));
  const baseUnit = unitById.get(baseUomId);
  const baseCode = baseUnit?.code ?? "units";
  // Archived units stay listed only where they're already in use.
  const usedIds = new Set([item?.base_uom_id, ...(item?.conversions ?? []).map((c) => c.uom_id)]);
  const choosable = units.filter((u) => !u.is_archived || usedIds.has(u.id));
  /** Units the product's packs can use: those marked as packs in Settings → Units (plus any it already has). */
  const packChoices = (current?: string) => choosable.filter((u) => u.id !== baseUomId && (u.is_pack || u.id === current));
  /** Sell in / Buy in: the product's own unit, its packs, then the other pack units (picking one adds it). */
  const packFactor = new Map((conversions ?? []).filter((c) => c.uomId).map((c) => [c.uomId, c.factor]));
  const unitChoices = [
    ...(conversions ?? []).flatMap((c) => {
      const unit = c.uomId && c.uomId !== baseUomId ? unitById.get(c.uomId) : undefined;
      return unit ? [unit] : [];
    }),
    ...packChoices().filter((u) => !packFactor.has(u.id)),
  ];
  const choiceLabel = (u: Unit) => {
    const factor = packFactor.get(u.id);
    if (factor === undefined) return `${u.name} (${u.code}) · new pack`;
    return Number.isFinite(factor) && factor > 0 ? `${u.name} (${u.code}) · ${formatNumber(factor)} ${baseCode}` : `${u.name} (${u.code})`;
  };
  /** Choosing a pack the product doesn't have yet adds its row, ready for "holds how many". */
  const unitPicker = (key: "purchaseUomId" | "saleUomId") => {
    const field = register(key, { setValueAs: (v) => v || null });
    return {
      ...field,
      onChange: async (event: { target: { value: string } }) => {
        await field.onChange(event);
        const id = event.target.value;
        const rows = getValues("conversions") ?? [];
        if (id && !rows.some((c) => c.uomId === id)) {
          addConversion({ uomId: id, factor: Number.NaN, sellingPrice: null, barcode: "" }, { focusName: `conversions.${rows.length}.factor` });
        }
      },
    };
  };
  /** Removing a unit that's the purchase / sale unit puts those back on the base unit. */
  const dropConversion = (index: number) => {
    const id = getValues(`conversions.${index}.uomId`);
    removeConversion(index);
    for (const key of ["purchaseUomId", "saleUomId"] as const) {
      if (id && getValues(key) === id) setValue(key, null, { shouldDirty: true });
    }
  };
  const attributeFields = applicableAttributes(attributes, index, categoryId);
  const margin =
    Number.isFinite(cost) && Number.isFinite(selling) ? marginPercent(cost, selling) : null;

  const setVehicleList = (next: FitmentVehicle[]) => {
    setVehicles(next);
    setValue("vehicleIds", next.map((v) => v.id), { shouldValidate: next.length > 0, shouldDirty: true });
  };

  const onSubmit = handleSubmit(async (form) => {
    setServerError(null);
    const problem = attributeProblem(attributeFields, form.attributes);
    if (problem) {
      setServerError(problem);
      notify.error(isEdit ? "Product not saved" : "Product not added", problem);
      return;
    }
    // Values of attributes from another category stay stored, so switching back restores them.
    const values = { ...form, attributes: mergeAttributeValues(item?.attributes, attributeFields, form.attributes) };
    const result = item
      ? await updateInventoryItem(item.id, values)
      : await createInventoryItem(values);

    if (result.status === "error") {
      if (result.field && result.field !== "attributes") setError(result.field, { message: result.message });
      else setServerError(result.message);
      notify.error(isEdit ? "Product not saved" : "Product not added", result.message);
      return;
    }
    notify.success(
      isEdit ? `${values.name} updated` : `${values.name} added to inventory`,
      `${values.sku} · ${formatQty(values.quantityOnHand, baseCode)} on hand · ${formatMoney(values.sellingPrice, { currency, showPaisa: true })}${!fitment ? "" : values.isUniversal ? " · Universal Fit" : ` · fits ${values.vehicleIds.length} vehicle${values.vehicleIds.length === 1 ? "" : "s"}`}`,
    );
    onDone();
  });

  const fieldError = (name: Exclude<keyof InventoryItemInput, "attributes" | "conversions">) =>
    errors[name]?.message ? (
      <span className="field-error" id={`${name}-error`}>{errors[name]?.message}</span>
    ) : null;

  const invalid = (name: keyof InventoryItemInput) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="modal-header">
        <div>
          <span className="header-icon blue"><Package size={18} /></span>
          <div>
            <Dialog.Title asChild>
              <h2>{isEdit ? "Edit inventory product" : "Add inventory product"}</h2>
            </Dialog.Title>
            <Dialog.Description asChild>
              <p>
                {fitment
                  ? isEdit
                    ? "Update pricing, stock and vehicle fitment."
                    : "Create a product and configure vehicle fitment."
                  : isEdit
                    ? "Update pricing, stock and product details."
                    : "Create a product with its pricing and starting stock."}
              </p>
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close asChild>
          <button type="button" className="icon-button" aria-label="Close">
            <X size={16} />
          </button>
        </Dialog.Close>
      </div>

      <div className="modal-body">
        {serverError && (
          <div className="form-alert form-alert-error modal-alert" role="alert">{serverError}</div>
        )}
        <div className="form-grid">
          <label>
            <span>SKU / PRODUCT CODE</span>
            <div className="input-with-action">
              <input placeholder="e.g. WF-CER20-40" autoComplete="off" {...invalid("sku")} {...register("sku")} />
              <button
                type="button"
                className="button button-ghost"
                title="Generate a SKU from the main category"
                onClick={() =>
                  setValue("sku", generateSku(index, getValues("categoryId")), { shouldValidate: true, shouldDirty: true })
                }
              >
                <Wand2 size={13} /> Generate
              </button>
            </div>
            {fieldError("sku")}
          </label>
          <div className="form-field">
            <label htmlFor="item-category"><span>CATEGORY</span></label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <CategoryPicker
                  id="item-category"
                  index={index}
                  value={field.value ?? null}
                  onChange={(id) => {
                    field.onChange(id ?? undefined);
                    field.onBlur();
                  }}
                  invalid={Boolean(errors.categoryId)}
                  describedBy={errors.categoryId ? "categoryId-error" : undefined}
                />
              )}
            />
            {fieldError("categoryId")}
          </div>
          <AttributeFields
            fields={attributeFields}
            values={attributeValues ?? {}}
            onChange={(next) => setValue("attributes", next, { shouldDirty: true })}
          />
          <label className="span-two">
            <span>PRODUCT NAME</span>
            <input placeholder={fitment ? "e.g. Suntek Carbon 20% · 40in Roll" : "e.g. the name on the shelf label"} {...invalid("name")} {...register("name")} />
            {fieldError("name")}
          </label>
          <label className="span-two">
            <span>DESCRIPTION (OPTIONAL)</span>
            <textarea rows={2} placeholder={fitment ? "Notes for your team: brand, spec, roll size…" : "Notes for your team: brand, size, pack…"} {...invalid("description")} {...register("description")} />
            {fieldError("description")}
          </label>
          <label>
            <span>VENDOR / SUPPLIER (OPTIONAL)</span>
            <input placeholder={fitment ? "e.g. Lahore Auto Traders" : "e.g. the supplier you buy it from"} {...invalid("vendorName")} {...register("vendorName")} />
            {fieldError("vendorName")}
          </label>
          <label>
            <span>UNIT</span>
            <select {...invalid("baseUomId")} {...register("baseUomId")}>
              {choosable.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
              ))}
            </select>
            {fieldError("baseUomId") ?? (
              <span className="field-note">
                Stock, prices and alerts are counted in this unit.{!packsEnabled && " To sell by the box or carton, an admin can switch packs on in Settings → Units."}
              </span>
            )}
          </label>
          <label>
            <span>COST PRICE · PER {baseCode.toUpperCase()}</span>
            <div className="money-input">
              <span>{currency}</span>
              <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" {...invalid("costPrice")} {...register("costPrice", { valueAsNumber: true })} />
            </div>
            {fieldError("costPrice")}
          </label>
          <label>
            <span>SELLING PRICE · PER {baseCode.toUpperCase()}</span>
            <div className="money-input">
              <span>{currency}</span>
              <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" {...invalid("sellingPrice")} {...register("sellingPrice", { valueAsNumber: true })} />
            </div>
            {fieldError("sellingPrice") ??
              (margin !== null && (
                <span className={`field-hint ${margin < 0 ? "negative" : ""}`}>
                  {margin.toFixed(1)}% margin
                </span>
              ))}
          </label>
          <label>
            <span>{isEdit ? "STOCK ON HAND" : "STARTING STOCK"}</span>
            <input type="number" inputMode={baseUnit?.decimals ? "decimal" : "numeric"} step={stepFor(baseUnit?.decimals ?? 0)} min="0" {...invalid("quantityOnHand")} {...register("quantityOnHand", { valueAsNumber: true })} />
            {fieldError("quantityOnHand") ??
              (item && item.reserved_quantity > 0 && (
                <span className="field-note">{formatQty(item.reserved_quantity, item.base_uom?.code)} reserved on open quotations.</span>
              ))}
          </label>
          <label>
            <span>LOW STOCK ALERT AT</span>
            <input type="number" inputMode={baseUnit?.decimals ? "decimal" : "numeric"} step={stepFor(baseUnit?.decimals ?? 0)} min="0" {...invalid("lowStockThreshold")} {...register("lowStockThreshold", { valueAsNumber: true })} />
            {fieldError("lowStockThreshold")}
          </label>
          <label className="span-two check-field">
            <input type="checkbox" {...register("priceIncludesTax")} />
            <div>
              <strong>Selling price includes tax</strong>
              <p>On quotes, tax is worked out of this price instead of added on top. The default comes from Settings.</p>
            </div>
          </label>
        </div>

        {packsEnabled && (
        <div className="compatibility unit-packs">
          <div className="unit-packs-head">
            <div>
              <h3>Packs &amp; selling units</h3>
              <p>Sell or buy this product by the box, carton, dozen… Stock is still counted in {baseCode}.</p>
            </div>
          </div>
          <div className="form-grid unit-defaults">
            <label>
              <span>SELL IN</span>
              <select {...invalid("saleUomId")} {...unitPicker("saleUomId")}>
                <option value="">{baseUnit ? `${baseUnit.name} (${baseCode})` : "Base unit"}</option>
                {unitChoices.map((u) => (
                  <option key={u.id} value={u.id}>{choiceLabel(u)}</option>
                ))}
              </select>
              {fieldError("saleUomId") ?? <span className="field-note">New invoice and quotation lines start in this unit.</span>}
            </label>
            <label>
              <span>BUY IN</span>
              <select {...invalid("purchaseUomId")} {...unitPicker("purchaseUomId")}>
                <option value="">{baseUnit ? `${baseUnit.name} (${baseCode})` : "Base unit"}</option>
                {unitChoices.map((u) => (
                  <option key={u.id} value={u.id}>{choiceLabel(u)}</option>
                ))}
              </select>
              {fieldError("purchaseUomId") ?? <span className="field-note">The unit you usually order it in (for purchase orders).</span>}
            </label>
          </div>
          {conversionFields.length === 0 ? (
            <p className="unit-packs-empty"><Boxes size={14} /> No packs: sold and bought in {baseCode} only.</p>
          ) : (
            <div className="conversion-list">
              {conversionFields.map((field, i) => {
                const rowErrors = errors.conversions?.[i];
                const factor = conversions?.[i]?.factor;
                const autoPrice = Number.isFinite(selling) && Number.isFinite(factor) ? Math.round(selling * factor * 100) / 100 : null;
                const message = rowErrors?.uomId?.message ?? rowErrors?.factor?.message ?? rowErrors?.sellingPrice?.message ?? rowErrors?.barcode?.message;
                return (
                  <div className="conversion-row" key={field.id}>
                    <label>
                      <span>PACK</span>
                      <select aria-invalid={rowErrors?.uomId ? true : undefined} {...register(`conversions.${i}.uomId`)}>
                        <option value="">Choose…</option>
                        {packChoices(conversions?.[i]?.uomId).map((u) => (
                          <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>HOLDS ({baseCode.toUpperCase()})</span>
                      <input type="number" inputMode="decimal" step="any" min="0" placeholder="e.g. 12" aria-invalid={rowErrors?.factor ? true : undefined} {...register(`conversions.${i}.factor`, { valueAsNumber: true })} />
                    </label>
                    <label>
                      <span>PRICE (OPTIONAL)</span>
                      <div className="money-input">
                        <span>{currency}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          placeholder={autoPrice === null ? "Auto" : formatNumber(autoPrice)}
                          aria-invalid={rowErrors?.sellingPrice ? true : undefined}
                          {...register(`conversions.${i}.sellingPrice`, { setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)) })}
                        />
                      </div>
                    </label>
                    <label>
                      <span>BARCODE (OPTIONAL)</span>
                      <input autoComplete="off" aria-invalid={rowErrors?.barcode ? true : undefined} {...register(`conversions.${i}.barcode`)} />
                    </label>
                    <button type="button" className="icon-button danger" aria-label="Remove this pack" onClick={() => dropConversion(i)}>
                      <Trash2 size={14} />
                    </button>
                    {message && <span className="field-error conversion-error">{message}</span>}
                  </div>
                );
              })}
            </div>
          )}
          {errors.conversions?.message && <span className="field-error">{errors.conversions.message}</span>}
          {packChoices().length === 0 && conversionFields.length === 0 ? (
            <p className="field-note">No units are marked as packs yet. An admin can mark Box, Carton and others in Settings → Units.</p>
          ) : (
            <button
              type="button"
              className="button button-ghost unit-packs-add"
              disabled={conversionFields.length >= 10}
              onClick={() => addConversion({ uomId: "", factor: Number.NaN, sellingPrice: null, barcode: "" }, { shouldFocus: true })}
            >
              <Plus size={13} /> Add a pack
            </button>
          )}
        </div>
        )}

        {fitment && (
          <div className="compatibility">
            <div>
              <h3>Compatibility mode</h3>
              <p>Choose how this product should match to vehicles.</p>
            </div>
            <Controller
              control={control}
              name="isUniversal"
              render={({ field }) => (
                <div className="radio-cards" role="radiogroup" aria-label="Compatibility mode">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={field.value}
                    className={field.value ? "selected" : ""}
                    onClick={() => field.onChange(true)}
                  >
                    <span className="radio-dot" />
                    <div className="choice-icon universal"><CheckCircle2 size={16} /></div>
                    <strong>Universal Fit</strong>
                    <p>Applies to all vehicles. Ideal for film rolls and generic accessories.</p>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!field.value}
                    className={!field.value ? "selected" : ""}
                    onClick={() => field.onChange(false)}
                  >
                    <span className="radio-dot" />
                    <div className="choice-icon vehicle"><Car size={16} /></div>
                    <strong>Vehicle Specific</strong>
                    <p>Link this product to specific Year, Make, and Model records.</p>
                  </button>
                </div>
              )}
            />
            {!isUniversal && (
              <YmmCompatibilitySelector
                value={vehicles}
                onChange={setVehicleList}
                error={errors.vehicleIds?.message}
              />
            )}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <Dialog.Close asChild>
          <button type="button" className="button">Cancel</button>
        </Dialog.Close>
        <button type="submit" className="button button-primary" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : isEdit ? (
            <Save size={14} />
          ) : (
            <Plus size={14} />
          )}
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Inventory Product"}
        </button>
      </div>
    </form>
  );
}
