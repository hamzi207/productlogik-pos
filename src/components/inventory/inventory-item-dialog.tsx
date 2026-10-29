"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "radix-ui";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, Car, CheckCircle2, Layers, Loader2, Package, Plus, Save, Trash2, Wand2, X } from "lucide-react";
import { createInventoryItem, updateInventoryItem } from "@/lib/actions/inventory";
import { formatMoney, marginPercent } from "@/lib/format";
import { notify } from "@/lib/notify";
import { applicableAttributes, asValues, attributeProblem, mergeAttributeValues, type Attribute } from "@/lib/attributes";
import { buildCategoryIndex, skuPrefix, type Category, type CategoryIndex } from "@/lib/categories";
import { stockAt, type StoreView } from "@/lib/stock";
import { AttributeFields } from "@/components/categories/attribute-fields";
import { useDiscardGuard } from "@/components/shared/discard-changes";
import { ModalSheet } from "@/components/shared/modal-sheet";
import type { FitmentVehicle, InventoryListItem } from "@/lib/types/inventory";
import { formatNumber, formatQty, stepFor, type Unit } from "@/lib/uom";
import { inventoryItemSchema, type InventoryItemInput } from "@/lib/validations/inventory.schema";
import { CategoryPicker } from "./category-picker";
import { galleryChanged, galleryFrom, ImageGallery, saveGallery, type GalleryImage } from "./image-gallery";
import { KitComponents, type KitPartInfo } from "./kit-components";
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
  /** Phase 20: stock entered is the current store's; admins set store prices and low-stock levels. */
  storeView: StoreView;
  /** Edit this item; omit to create a new one. */
  item?: InventoryListItem;
  /** RF-21.1: a new product starts as a kit. */
  kit?: boolean;
};

/** Add / edit inventory product modal (Figma "Add inventory product"). */
export function InventoryItemDialog({ open, onOpenChange, currency, pricesIncludeTax, categories, attributes, fitment, units, packsEnabled, storeView, item, kit = false }: Props) {
  // Closing with unsaved edits asks first (Cancel, X, Escape, clicking outside).
  const guard = useDiscardGuard({
    onOpenChange,
    discardedNote: item ? `${item.name} was left as it was saved.` : kit ? "The new kit was not added to inventory." : "The new product was not added to inventory.",
  });
  return (
    <>
      <Dialog.Root open={open} onOpenChange={guard.requestOpenChange}>
        <ModalSheet>
          {/* Remount per open so the form always starts from the item's current values. */}
          {open && (
            <ItemForm
              key={item?.id ?? (kit ? "new-kit" : "new")}
              item={item}
              newKit={kit}
              currency={currency}
              pricesIncludeTax={pricesIncludeTax}
              categories={categories}
              attributes={attributes}
              fitment={fitment}
              units={units}
              packsEnabled={packsEnabled}
              storeView={storeView}
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
  newKit,
  currency,
  pricesIncludeTax,
  categories,
  attributes,
  fitment,
  units,
  packsEnabled,
  storeView,
  onDirtyChange,
  onDone,
}: {
  item?: InventoryListItem;
  newKit: boolean;
  currency: string;
  pricesIncludeTax: boolean;
  categories: Category[];
  attributes: Attribute[];
  fitment: boolean;
  units: Unit[];
  packsEnabled: boolean;
  storeView: StoreView;
  onDirtyChange: (dirty: boolean) => void;
  onDone: () => void;
}) {
  const isEdit = Boolean(item);
  const [serverError, setServerError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<FitmentVehicle[]>(item?.vehicles ?? []);
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  // RF-21.2: images are saved after the product (a new one has no id before).
  const savedImages = useMemo(() => item?.images ?? [], [item]);
  const [gallery, setGallery] = useState<GalleryImage[]>(() => galleryFrom(savedImages));
  // RF-21.1: names, SKUs and stock of the kit's products, for its list.
  const [partInfo, setPartInfo] = useState<Record<string, KitPartInfo>>(() =>
    Object.fromEntries(
      (item?.kit ?? []).map((p) => {
        const at = storeView.multi ? p.stock.find((l) => l.store_id === storeView.currentId) : null;
        const available = storeView.multi ? (at ? at.on_hand - at.reserved : 0) : p.quantity_on_hand - p.reserved_quantity;
        return [p.item_id, { name: p.name, sku: p.sku, unit: p.unit, available }];
      }),
    ),
  );
  // Phase 20: the stock field is the current store's; store prices for admins with more than one store.
  const here = item && storeView.multi ? stockAt(item.stock, storeView.currentId) : null;
  const storeRows = storeView.multi && storeView.admin
    ? storeView.stores.filter((s) => s.is_active || item?.store_prices.some((p) => p.store_id === s.id))
    : [];
  const storeSettings = storeRows.length
    ? storeRows.map((s) => ({
        storeId: s.id,
        sellingPrice: item?.store_prices.find((p) => p.store_id === s.id)?.selling_price ?? null,
        lowStockThreshold: item?.stock.find((l) => l.store_id === s.id)?.low_stock_threshold ?? null,
      }))
    : undefined;

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
          quantityOnHand: here ? here.onHand : item.quantity_on_hand,
          lowStockThreshold: item.low_stock_threshold,
          baseUomId: item.base_uom_id,
          conversions: item.conversions.map((c) => ({
            uomId: c.uom_id,
            factor: c.factor,
            sellingPrice: c.selling_price,
            barcode: c.barcode ?? "",
          })),
          barcode: item.barcode ?? "",
          isKit: item.is_kit,
          kitComponents: item.kit.map((p) => ({ itemId: p.item_id, quantity: p.quantity })),
          purchaseUomId: item.purchase_uom_id,
          saleUomId: item.sale_uom_id,
          priceIncludesTax: item.price_includes_tax,
          isUniversal: item.is_universal,
          vehicleIds: item.vehicles.map((v) => v.id),
          attributes: asValues(item.attributes),
          storeSettings,
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
          barcode: "",
          isKit: newKit,
          kitComponents: [],
          // A kit's cost is worked out from its products when it's saved.
          costPrice: newKit ? 0 : undefined,
          purchaseUomId: null,
          saleUomId: null,
          priceIncludesTax: pricesIncludeTax,
          isUniversal: true,
          vehicleIds: [],
          attributes: {},
          storeSettings,
        },
  });

  const imagesDirty = galleryChanged(savedImages, gallery);
  useEffect(() => onDirtyChange(isDirty || imagesDirty), [isDirty, imagesDirty, onDirtyChange]);

  const { fields: conversionFields, append: addConversion, remove: removeConversion } = useFieldArray({ control, name: "conversions" });

  const [cost, selling, isUniversal, categoryId, attributeValues, baseUomId, conversions, threshold, isKit] = useWatch({
    control,
    name: ["costPrice", "sellingPrice", "isUniversal", "categoryId", "attributes", "baseUomId", "conversions", "lowStockThreshold", "isKit"],
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
    const imageProblem = await saveGallery({ itemId: result.id }, savedImages, gallery);
    const stockText = values.isKit
      ? `${values.kitComponents.length} product${values.kitComponents.length === 1 ? "" : "s"} per kit`
      : `${formatQty(values.quantityOnHand, baseCode)} on hand`;
    notify.success(
      isEdit ? `${values.name} updated` : `${values.name} added to inventory`,
      `${values.sku} · ${stockText} · ${formatMoney(values.sellingPrice, { currency, showPaisa: true })}${!fitment ? "" : values.isUniversal ? " · Universal Fit" : ` · fits ${values.vehicleIds.length} vehicle${values.vehicleIds.length === 1 ? "" : "s"}`}`,
    );
    if (imageProblem) notify.error("Some images weren't saved", `${values.name} is saved. ${imageProblem}`);
    onDone();
  });

  const fieldError = (name: Exclude<keyof InventoryItemInput, "attributes" | "conversions" | "storeSettings" | "kitComponents">) =>
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
          <span className="header-icon blue">{isKit ? <Layers size={18} /> : <Package size={18} />}</span>
          <div>
            <Dialog.Title asChild>
              <h2>{isKit ? (isEdit ? "Edit kit" : "Add kit") : isEdit ? "Edit inventory product" : "Add inventory product"}</h2>
            </Dialog.Title>
            <Dialog.Description asChild>
              <p>
                {isKit
                  ? "A bundle sold as one line. Selling it takes its products from stock."
                  : fitment
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
            <span>BARCODE (OPTIONAL)</span>
            <input placeholder="Scan or type the code on the product" autoComplete="off" {...invalid("barcode")} {...register("barcode")} />
            {fieldError("barcode") ?? <span className="field-note">Scanning it in line search adds this product.</span>}
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
              <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" readOnly={isKit} {...invalid("costPrice")} {...register("costPrice", { valueAsNumber: true })} />
            </div>
            {fieldError("costPrice") ?? (isKit && <span className="field-note">The cost of its products, worked out when the kit is saved.</span>)}
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
          {!isKit && (
          <>
          <label>
            <span>
              {isEdit ? "STOCK ON HAND" : "STARTING STOCK"}
              {storeView.multi ? ` AT ${storeView.currentName.toUpperCase()}` : ""}
            </span>
            <input type="number" inputMode={baseUnit?.decimals ? "decimal" : "numeric"} step={stepFor(baseUnit?.decimals ?? 0)} min="0" {...invalid("quantityOnHand")} {...register("quantityOnHand", { valueAsNumber: true })} />
            {fieldError("quantityOnHand") ??
              (item && (here ? here.reserved : item.reserved_quantity) > 0 ? (
                <span className="field-note">{formatQty(here ? here.reserved : item.reserved_quantity, item.base_uom?.code)} reserved on open quotations{here ? " here" : ""}.</span>
              ) : (
                storeView.multi && <span className="field-note">Switch store in the top bar to change another store&apos;s stock.</span>
              ))}
          </label>
          <label>
            <span>LOW STOCK ALERT AT{storeRows.length ? " (DEFAULT)" : ""}</span>
            <input type="number" inputMode={baseUnit?.decimals ? "decimal" : "numeric"} step={stepFor(baseUnit?.decimals ?? 0)} min="0" {...invalid("lowStockThreshold")} {...register("lowStockThreshold", { valueAsNumber: true })} />
            {fieldError("lowStockThreshold")}
          </label>
          </>
          )}
          <label className="span-two check-field">
            <input type="checkbox" {...register("priceIncludesTax")} />
            <div>
              <strong>Selling price includes tax</strong>
              <p>On quotes, tax is worked out of this price instead of added on top. The default comes from Settings.</p>
            </div>
          </label>
        </div>

        {storeRows.length > 0 && (
          <div className={`compatibility store-prices${isKit ? " no-levels" : ""}`}>
            <div className="unit-packs-head">
              <div>
                <h3>{isKit ? "Store prices" : <>Store prices &amp; low-stock levels</>}</h3>
                <p>Leave empty to use the price and alert level above. A store price replaces the price on that store&apos;s documents; packs with their own price keep it.</p>
              </div>
            </div>
            <div className="store-prices-grid">
              <span className="store-prices-head">STORE</span>
              <span className="store-prices-head">SELLING PRICE ({currency})</span>
              {!isKit && <span className="store-prices-head">LOW STOCK AT</span>}
              {storeRows.map((s, i) => {
                const rowError = errors.storeSettings?.[i]?.sellingPrice?.message ?? errors.storeSettings?.[i]?.lowStockThreshold?.message;
                return (
                  <div key={s.id} className="store-prices-row">
                    <strong>{s.name}</strong>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      aria-label={`Selling price at ${s.name}`}
                      placeholder={Number.isFinite(selling) ? formatNumber(selling) : ""}
                      {...register(`storeSettings.${i}.sellingPrice`, { setValueAs: (v) => (v === "" || v === null ? null : Number(v)) })}
                    />
                    <input
                      type="number"
                      hidden={isKit}
                      inputMode={baseUnit?.decimals ? "decimal" : "numeric"}
                      step={stepFor(baseUnit?.decimals ?? 0)}
                      min="0"
                      aria-label={`Low-stock level at ${s.name}`}
                      placeholder={Number.isFinite(threshold) ? formatNumber(threshold) : ""}
                      {...register(`storeSettings.${i}.lowStockThreshold`, { setValueAs: (v) => (v === "" || v === null ? null : Number(v)) })}
                    />
                    {rowError && <span className="field-error">{rowError}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isKit && (
          <Controller
            control={control}
            name="kitComponents"
            render={({ field }) => (
              <KitComponents
                value={field.value ?? []}
                onChange={(next) => field.onChange(next)}
                info={partInfo}
                onInfo={(id, info) => setPartInfo((prev) => ({ ...prev, [id]: info }))}
                kitId={item?.id}
                store={storeView.multi ? storeView.currentId : null}
                error={errors.kitComponents?.message ?? errors.kitComponents?.root?.message}
                rowErrors={(field.value ?? []).map((_, i) => errors.kitComponents?.[i]?.quantity?.message ?? errors.kitComponents?.[i]?.itemId?.message)}
              />
            )}
          />
        )}

        <ImageGallery value={gallery} onChange={setGallery} />

        {packsEnabled && !isKit && (
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
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : isKit ? "Add Kit" : "Add Inventory Product"}
        </button>
      </div>
    </form>
  );
}
