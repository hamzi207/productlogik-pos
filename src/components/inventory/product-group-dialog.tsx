"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "radix-ui";
import { Controller, useFieldArray, useForm, useWatch, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Car, CheckCircle2, Layers, Loader2, Plus, Save, Trash2, Wand2, X } from "lucide-react";
import { saveProductGroup } from "@/lib/actions/product-groups";
import { applicableAttributes, asValues, attributeProblem, mergeAttributeValues, type Attribute } from "@/lib/attributes";
import { buildCategoryIndex, skuPrefix, type Category } from "@/lib/categories";
import { formatMoney, marginPercent } from "@/lib/format";
import { notify } from "@/lib/notify";
import { stockAt, type StoreView } from "@/lib/stock";
import type { FitmentVehicle, ProductGroupEntry } from "@/lib/types/inventory";
import { formatNumber, formatQty, stepFor, type Unit } from "@/lib/uom";
import { productGroupSchema, variantSku, type ProductGroupInput, type VariantInput } from "@/lib/validations/product-group.schema";
import { AttributeFields } from "@/components/categories/attribute-fields";
import { useDiscardGuard } from "@/components/shared/discard-changes";
import { ModalSheet } from "@/components/shared/modal-sheet";
import { CategoryPicker } from "./category-picker";
import { galleryChanged, galleryFrom, ImageGallery, saveGallery, type GalleryImage } from "./image-gallery";
import { YmmCompatibilitySelector } from "./ymm-compatibility-selector";

// Phase 21: a product with variants (Polo Shirt in Red / Blue × S / M / L). The options and their values
// make the matrix; each combination is a variant with its own SKU, barcode, price, stock and switch.
// Images, fitment, attributes and the category belong to the group and every variant shares them.

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  pricesIncludeTax: boolean;
  categories: Category[];
  attributes: Attribute[];
  fitment: boolean;
  units: Unit[];
  /** Stock in the matrix is the current store's (with more than one store). */
  storeView: StoreView;
  /** Edit this group; omit to create one. */
  group?: ProductGroupEntry;
};

/** One cell row of the matrix; null fields follow the group. */
type Row = {
  id: string | null;
  /** null = made from the prefix and the values. */
  sku: string | null;
  barcode: string;
  sellingPrice: number | null;
  costPrice: number | null;
  lowStockThreshold: number | null;
  enabled: boolean;
  onHand: number | null;
  savedOnHand: number | null;
};

type FormValue = { id: string | null; value: string; priceDelta: number };
type Combo = { key: string; values: FormValue[] };

/** A value's identity: its id once saved (so a rename keeps its variants), else its text. */
const valueKey = (v: { id: string | null; value: string }) => v.id ?? `new:${v.value.trim().toLowerCase()}`;

function combosOf(options: { values: FormValue[] }[]): Combo[] {
  const lists = options.map((o) => (o.values ?? []).filter((v) => v.value?.trim()));
  if (lists.length === 0 || lists.some((l) => l.length === 0)) return [];
  return lists
    .reduce<FormValue[][]>((acc, list) => acc.flatMap((row) => list.map((v) => [...row, v])), [[]])
    .map((values) => ({ key: values.map(valueKey).join("|"), values }));
}

const numberOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

const defaultUnit = (units: Unit[]) => {
  const active = units.filter((u) => !u.is_archived);
  return active.find((u) => u.code.toLowerCase() === "pcs") ?? active[0];
};

export function ProductGroupDialog({ open, onOpenChange, ...rest }: Props) {
  const guard = useDiscardGuard({
    onOpenChange,
    discardedNote: rest.group ? `${rest.group.name} was left as it was saved.` : "The new product was not added to inventory.",
  });
  return (
    <>
      <Dialog.Root open={open} onOpenChange={guard.requestOpenChange}>
        <ModalSheet className="modal modal-wide">
          {open && <GroupForm key={rest.group?.id ?? "new"} {...rest} onDirtyChange={guard.setDirty} onDone={guard.close} />}
        </ModalSheet>
      </Dialog.Root>
      {guard.prompt}
    </>
  );
}

function GroupForm({
  group,
  currency,
  pricesIncludeTax,
  categories,
  attributes,
  fitment,
  units,
  storeView,
  onDirtyChange,
  onDone,
}: Omit<Props, "open" | "onOpenChange"> & { onDirtyChange: (dirty: boolean) => void; onDone: () => void }) {
  const isEdit = Boolean(group);
  const index = useMemo(() => buildCategoryIndex(categories), [categories]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<FitmentVehicle[]>(group?.vehicles ?? []);
  const savedImages = useMemo(() => group?.images ?? [], [group]);
  const [gallery, setGallery] = useState<GalleryImage[]>(() => galleryFrom(savedImages));

  // Saved variants by their value ids; their stock at the current store.
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      (group?.variants ?? []).map((v) => {
        const ids = (Array.isArray(v.option_values) ? v.option_values : []).map(String);
        const onHand = storeView.multi ? stockAt(v.stock, storeView.currentId).onHand : Number(v.quantity_on_hand);
        return [
          ids.join("|"),
          {
            id: v.id,
            sku: v.sku,
            barcode: v.barcode ?? "",
            sellingPrice: v.own_price ? Number(v.selling_price) : null,
            costPrice: v.own_cost ? Number(v.cost_price) : null,
            lowStockThreshold: Number(v.low_stock_threshold),
            enabled: true,
            onHand,
            savedOnHand: onHand,
          } satisfies Row,
        ];
      }),
    ),
  );
  const [rowsDirty, setRowsDirty] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProductGroupInput>({
    resolver: zodResolver(productGroupSchema),
    defaultValues: group
      ? {
          name: group.name,
          skuPrefix: group.sku_prefix,
          description: group.description ?? "",
          vendorName: group.vendor_name ?? "",
          categoryId: group.category_id,
          baseUomId: group.base_uom_id,
          costPrice: group.cost_price,
          sellingPrice: group.selling_price,
          lowStockThreshold: group.low_stock_threshold,
          priceIncludesTax: group.price_includes_tax,
          isUniversal: group.is_universal,
          vehicleIds: group.vehicles.map((v) => v.id),
          attributes: asValues(group.attributes),
          options: group.options.map((o) => ({ id: o.id, name: o.name, values: o.values.map((v) => ({ id: v.id, value: v.value, priceDelta: Number(v.price_delta) })) })),
          variants: [],
        }
      : {
          name: "",
          skuPrefix: "",
          description: "",
          vendorName: "",
          baseUomId: defaultUnit(units)?.id,
          lowStockThreshold: 5,
          priceIncludesTax: pricesIncludeTax,
          isUniversal: true,
          vehicleIds: [],
          attributes: {},
          options: [{ id: null, name: "Size", values: [] }],
          variants: [],
        },
  });

  const imagesDirty = galleryChanged(savedImages, gallery);
  useEffect(() => onDirtyChange(isDirty || imagesDirty || rowsDirty), [isDirty, imagesDirty, rowsDirty, onDirtyChange]);

  const { fields: optionFields, append: addOption, remove: removeOption } = useFieldArray({ control, name: "options" });
  const [options, prefix, cost, selling, threshold, categoryId, attributeValues, baseUomId, isUniversal] = useWatch({
    control,
    name: ["options", "skuPrefix", "costPrice", "sellingPrice", "lowStockThreshold", "categoryId", "attributes", "baseUomId", "isUniversal"],
  });
  const combos = useMemo(() => combosOf(options ?? []), [options]);
  const savedValueIds = useMemo(() => new Set(group?.options.flatMap((o) => o.values.map((v) => v.id)) ?? []), [group]);
  const baseUnit = units.find((u) => u.id === baseUomId);
  const baseCode = baseUnit?.code ?? "units";
  const step = stepFor(baseUnit?.decimals ?? 0);
  const attributeFields = applicableAttributes(attributes, index, categoryId);
  const choosable = units.filter((u) => !u.is_archived || u.id === group?.base_uom_id);
  const margin = Number.isFinite(cost) && Number.isFinite(selling) ? marginPercent(cost, selling) : null;

  /** The row for a combination: what's been entered, else defaults (a combination of saved values that has no
   * variant was switched off before, so it starts off; one with a new value starts on). */
  const rowFor = (c: Combo): Row =>
    rows[c.key] ?? {
      id: null,
      sku: null,
      barcode: "",
      sellingPrice: null,
      costPrice: null,
      lowStockThreshold: null,
      enabled: !isEdit || c.values.some((v) => !v.id || !savedValueIds.has(v.id)),
      onHand: null,
      savedOnHand: null,
    };
  const update = (keys: string[], patch: Partial<Row>) => {
    const byKey = new Map(combos.map((c) => [c.key, c]));
    setRows((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        const combo = byKey.get(key);
        if (combo) next[key] = { ...(prev[key] ?? rowFor(combo)), ...patch };
      }
      return next;
    });
    setRowsDirty(true);
  };
  const autoPrice = (c: Combo) => (Number.isFinite(selling) ? selling : 0) + c.values.reduce((sum, v) => sum + (Number.isFinite(v.priceDelta) ? v.priceDelta : 0), 0);
  const skuOf = (c: Combo, r: Row) => r.sku ?? variantSku(prefix || "SKU", c.values.map((v) => v.value));

  const variantsPayload = (): VariantInput[] =>
    combos.map((c) => {
      const r = rowFor(c);
      const changed = r.onHand !== null && r.onHand !== r.savedOnHand;
      return {
        id: r.id,
        values: c.values.map((v) => v.value.trim()),
        sku: skuOf(c, r),
        barcode: r.barcode,
        sellingPrice: r.sellingPrice,
        costPrice: r.costPrice,
        lowStockThreshold: r.lowStockThreshold ?? (Number.isFinite(threshold) ? threshold : 0),
        enabled: r.enabled,
        stock: changed ? [{ storeId: storeView.currentId, onHand: r.onHand }] : [],
      };
    });

  const setVehicleList = (next: FitmentVehicle[]) => {
    setVehicles(next);
    setValue("vehicleIds", next.map((v) => v.id), { shouldValidate: next.length > 0, shouldDirty: true });
  };

  const submit = handleSubmit(async (form) => {
    setServerError(null);
    const problem = attributeProblem(attributeFields, form.attributes);
    if (problem) {
      setServerError(problem);
      notify.error(isEdit ? "Product not saved" : "Product not added", problem);
      return;
    }
    const values = { ...form, attributes: mergeAttributeValues(group?.attributes, attributeFields, form.attributes) };
    const result = await saveProductGroup(group?.id ?? null, values);
    if (result.status === "error") {
      if (result.field === "name" || result.field === "skuPrefix") setError(result.field, { message: result.message });
      else setServerError(result.message);
      notify.error(isEdit ? "Product not saved" : "Product not added", result.message);
      return;
    }
    const imageProblem = await saveGallery({ groupId: result.id }, savedImages, gallery);
    const on = values.variants.filter((v) => v.enabled).length;
    notify.success(isEdit ? `${values.name} updated` : `${values.name} added to inventory`, `${on} variant${on === 1 ? "" : "s"} · from ${formatMoney(values.sellingPrice, { currency, showPaisa: true })}`);
    if (imageProblem) notify.error("Some images weren't saved", `${values.name} is saved. ${imageProblem}`);
    onDone();
  });
  // The matrix lives outside the form fields: it's put in just before validating.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    setValue("variants", variantsPayload());
    return submit(e);
  };

  const fieldError = (name: "name" | "skuPrefix" | "description" | "vendorName" | "categoryId" | "baseUomId" | "costPrice" | "sellingPrice" | "lowStockThreshold") =>
    errors[name]?.message ? <span className="field-error" id={`group-${name}-error`}>{errors[name]?.message}</span> : null;
  const invalid = (name: keyof ProductGroupInput) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `group-${name}-error` : undefined,
  });

  const allSelected = combos.length > 0 && combos.every((c) => selected.has(c.key));
  const onCount = combos.filter((c) => rowFor(c).enabled).length;
  const variantErrors = errors.variants;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="modal-header">
        <div>
          <span className="header-icon blue"><Layers size={18} /></span>
          <div>
            <Dialog.Title asChild>
              <h2>{isEdit ? "Edit product with variants" : "Add product with variants"}</h2>
            </Dialog.Title>
            <Dialog.Description asChild>
              <p>One product in several sizes, colours or styles. Each combination gets its own SKU, price and stock.</p>
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close asChild>
          <button type="button" className="icon-button" aria-label="Close"><X size={16} /></button>
        </Dialog.Close>
      </div>

      <div className="modal-body">
        {serverError && <div className="form-alert form-alert-error modal-alert" role="alert">{serverError}</div>}
        <div className="form-grid">
          <label className="span-two">
            <span>PRODUCT NAME</span>
            <input placeholder="e.g. Polo Shirt" {...invalid("name")} {...register("name")} />
            {fieldError("name") ?? <span className="field-note">Variants are named after it: “Polo Shirt – Red / L”.</span>}
          </label>
          <label>
            <span>SKU PREFIX</span>
            <div className="input-with-action">
              <input placeholder="e.g. POLO" autoComplete="off" {...invalid("skuPrefix")} {...register("skuPrefix")} />
              <button
                type="button"
                className="button button-ghost"
                title="Make a prefix from the main category"
                onClick={() => {
                  const id = getValues("categoryId");
                  setValue("skuPrefix", `${skuPrefix(id ? index.byId.get(id) : undefined)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`, { shouldValidate: true, shouldDirty: true });
                }}
              >
                <Wand2 size={13} /> Generate
              </button>
            </div>
            {fieldError("skuPrefix") ?? <span className="field-note">Variant SKUs start with it: POLO-RED-L.</span>}
          </label>
          <div className="form-field">
            <label htmlFor="group-category"><span>CATEGORY</span></label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <CategoryPicker
                  id="group-category"
                  index={index}
                  value={field.value ?? null}
                  onChange={(id) => {
                    field.onChange(id ?? undefined);
                    field.onBlur();
                  }}
                  invalid={Boolean(errors.categoryId)}
                  describedBy={errors.categoryId ? "group-categoryId-error" : undefined}
                />
              )}
            />
            {fieldError("categoryId")}
          </div>
          <AttributeFields fields={attributeFields} values={attributeValues ?? {}} onChange={(next) => setValue("attributes", next, { shouldDirty: true })} />
          <label className="span-two">
            <span>DESCRIPTION (OPTIONAL)</span>
            <textarea rows={2} placeholder="Notes for your team: brand, material, fit…" {...invalid("description")} {...register("description")} />
            {fieldError("description")}
          </label>
          <label>
            <span>VENDOR / SUPPLIER (OPTIONAL)</span>
            <input placeholder="e.g. the supplier you buy it from" {...invalid("vendorName")} {...register("vendorName")} />
            {fieldError("vendorName")}
          </label>
          <label>
            <span>UNIT</span>
            <select {...invalid("baseUomId")} {...register("baseUomId")}>
              {choosable.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
              ))}
            </select>
            {fieldError("baseUomId") ?? <span className="field-note">Every variant is counted in this unit.</span>}
          </label>
          <label>
            <span>COST PRICE · PER {baseCode.toUpperCase()}</span>
            <div className="money-input">
              <span>{currency}</span>
              <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" {...invalid("costPrice")} {...register("costPrice", { valueAsNumber: true })} />
            </div>
            {fieldError("costPrice") ?? <span className="field-note">For every variant without its own cost.</span>}
          </label>
          <label>
            <span>SELLING PRICE · PER {baseCode.toUpperCase()}</span>
            <div className="money-input">
              <span>{currency}</span>
              <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" {...invalid("sellingPrice")} {...register("sellingPrice", { valueAsNumber: true })} />
            </div>
            {fieldError("sellingPrice") ??
              (margin !== null ? <span className={`field-hint ${margin < 0 ? "negative" : ""}`}>{margin.toFixed(1)}% margin · before price changes per value</span> : null)}
          </label>
          <label>
            <span>LOW STOCK ALERT AT</span>
            <input type="number" inputMode={baseUnit?.decimals ? "decimal" : "numeric"} step={step} min="0" {...invalid("lowStockThreshold")} {...register("lowStockThreshold", { valueAsNumber: true })} />
            {fieldError("lowStockThreshold") ?? <span className="field-note">For new variants; each can have its own below.</span>}
          </label>
          <label className="check-field">
            <input type="checkbox" {...register("priceIncludesTax")} />
            <div>
              <strong>Selling price includes tax</strong>
              <p>The default comes from Settings.</p>
            </div>
          </label>
        </div>

        <div className="compatibility variant-options">
          <div className="unit-packs-head">
            <div>
              <h3>Options</h3>
              <p>
                {isEdit
                  ? "Rename options and values, add values, or change their price. Options can't be added or removed once there are variants."
                  : "Up to 3 options (e.g. Size and Colour). A value's price change is added to the selling price (+200 for XL)."}
              </p>
            </div>
            <button
              type="button"
              className="button button-ghost"
              disabled={isEdit || optionFields.length >= 3}
              onClick={() => addOption({ id: null, name: optionFields.length === 1 ? "Colour" : "", values: [] }, { shouldFocus: true })}
            >
              <Plus size={13} /> Add option
            </button>
          </div>
          <div className="option-cards">
            {optionFields.map((field, i) => (
              <OptionCard
                key={field.id}
                index={i}
                control={control}
                register={register}
                errors={errors}
                currency={currency}
                canRemove={!isEdit && optionFields.length > 1}
                onRemove={() => removeOption(i)}
              />
            ))}
          </div>
          {errors.options?.message && <span className="field-error">{errors.options.message}</span>}
        </div>

        <div className="compatibility variant-matrix">
          <div className="unit-packs-head">
            <div>
              <h3>Variants</h3>
              <p>
                {combos.length === 0
                  ? "Add values to every option to see the variants."
                  : `${onCount} of ${combos.length} switched on. Empty prices and costs follow the product's.${storeView.multi ? ` Stock is ${storeView.currentName}'s.` : ""}`}
              </p>
            </div>
          </div>
          {combos.length > 300 && <div className="form-alert form-alert-error" role="alert">That makes {combos.length} variants; a product can have at most 300.</div>}
          {selected.size > 0 && (
            <BulkBar
              count={selected.size}
              step={step}
              onApply={(patch) => update([...selected], patch)}
              onClear={() => setSelected(new Set())}
            />
          )}
          {combos.length > 0 && combos.length <= 300 && (
            <div className="table-wrap matrix-wrap">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select every variant"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(combos.map((c) => c.key)))}
                      />
                    </th>
                    <th>VARIANT</th>
                    <th>SKU</th>
                    <th>BARCODE</th>
                    <th>PRICE ({currency})</th>
                    <th>COST ({currency})</th>
                    <th>LOW AT</th>
                    <th>{storeView.multi ? `STOCK · ${storeView.currentName.toUpperCase()}` : "STOCK"}</th>
                    <th>ON</th>
                  </tr>
                </thead>
                <tbody>
                  {combos.map((c, i) => {
                    const r = rowFor(c);
                    const label = c.values.map((v) => v.value.trim()).join(" / ");
                    const rowError = variantErrors?.[i];
                    const message = rowError?.sku?.message ?? rowError?.barcode?.message ?? rowError?.sellingPrice?.message ?? rowError?.costPrice?.message ?? rowError?.lowStockThreshold?.message ?? rowError?.stock?.[0]?.onHand?.message;
                    const stockLeft = !r.enabled && r.id && (r.onHand ?? r.savedOnHand ?? 0) > 0;
                    return (
                      <tr key={c.key} className={r.enabled ? undefined : "matrix-off"}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${label}`}
                            checked={selected.has(c.key)}
                            onChange={() =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(c.key)) next.delete(c.key);
                                else next.add(c.key);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td>
                          <strong className="matrix-label">{label}</strong>
                          {!r.id && r.enabled && <span className="badge badge-blue matrix-new">New</span>}
                          {message && <span className="field-error">{message}</span>}
                          {stockLeft && <span className="field-error">Has {formatQty(r.onHand ?? r.savedOnHand ?? 0, baseCode)} in stock: set it to 0 to switch it off.</span>}
                        </td>
                        <td>
                          <input
                            className="mono"
                            aria-label={`SKU of ${label}`}
                            aria-invalid={rowError?.sku ? true : undefined}
                            value={skuOf(c, r)}
                            onChange={(e) => update([c.key], { sku: e.target.value.toUpperCase() })}
                          />
                        </td>
                        <td>
                          <input aria-label={`Barcode of ${label}`} autoComplete="off" value={r.barcode} aria-invalid={rowError?.barcode ? true : undefined} onChange={(e) => update([c.key], { barcode: e.target.value })} />
                        </td>
                        <td>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            aria-label={`Price of ${label}`}
                            placeholder={formatNumber(autoPrice(c))}
                            value={r.sellingPrice ?? ""}
                            onChange={(e) => update([c.key], { sellingPrice: numberOrNull(e.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            aria-label={`Cost of ${label}`}
                            placeholder={Number.isFinite(cost) ? formatNumber(cost) : ""}
                            value={r.costPrice ?? ""}
                            onChange={(e) => update([c.key], { costPrice: numberOrNull(e.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            inputMode="decimal"
                            step={step}
                            min="0"
                            aria-label={`Low-stock level of ${label}`}
                            placeholder={Number.isFinite(threshold) ? formatNumber(threshold) : ""}
                            value={r.lowStockThreshold ?? ""}
                            onChange={(e) => update([c.key], { lowStockThreshold: numberOrNull(e.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            inputMode="decimal"
                            step={step}
                            min="0"
                            aria-label={`Stock of ${label}`}
                            placeholder="0"
                            value={r.onHand ?? ""}
                            onChange={(e) => update([c.key], { onHand: numberOrNull(e.target.value) })}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={r.enabled}
                            aria-label={`${label} switched ${r.enabled ? "on" : "off"}`}
                            className={`matrix-switch${r.enabled ? " on" : ""}`}
                            onClick={() => update([c.key], { enabled: !r.enabled })}
                          >
                            <span />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {(variantErrors?.message ?? variantErrors?.root?.message) && <span className="field-error">{variantErrors?.message ?? variantErrors?.root?.message}</span>}
        </div>

        <ImageGallery value={gallery} onChange={setGallery} note="Up to 8 photos (PNG or JPG), shown for every variant. The first is the main image." />

        {fitment && (
          <div className="compatibility">
            <div>
              <h3>Compatibility mode</h3>
              <p>Every variant fits the same vehicles.</p>
            </div>
            <Controller
              control={control}
              name="isUniversal"
              render={({ field }) => (
                <div className="radio-cards" role="radiogroup" aria-label="Compatibility mode">
                  <button type="button" role="radio" aria-checked={field.value} className={field.value ? "selected" : ""} onClick={() => field.onChange(true)}>
                    <span className="radio-dot" />
                    <div className="choice-icon universal"><CheckCircle2 size={16} /></div>
                    <strong>Universal Fit</strong>
                    <p>Applies to all vehicles.</p>
                  </button>
                  <button type="button" role="radio" aria-checked={!field.value} className={!field.value ? "selected" : ""} onClick={() => field.onChange(false)}>
                    <span className="radio-dot" />
                    <div className="choice-icon vehicle"><Car size={16} /></div>
                    <strong>Vehicle Specific</strong>
                    <p>Link it to specific Year, Make, and Model records.</p>
                  </button>
                </div>
              )}
            />
            {!isUniversal && <YmmCompatibilitySelector value={vehicles} onChange={setVehicleList} error={errors.vehicleIds?.message} />}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <Dialog.Close asChild>
          <button type="button" className="button">Cancel</button>
        </Dialog.Close>
        <button type="submit" className="button button-primary" disabled={isSubmitting || combos.length > 300}>
          {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : isEdit ? <Save size={14} /> : <Plus size={14} />}
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : `Add Product · ${onCount} variant${onCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </form>
  );
}

/** One option: its name and its values, each with an optional price change. */
function OptionCard({
  index,
  control,
  register,
  errors,
  currency,
  canRemove,
  onRemove,
}: {
  index: number;
  control: Control<ProductGroupInput>;
  register: UseFormRegister<ProductGroupInput>;
  errors: FieldErrors<ProductGroupInput>;
  currency: string;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: `options.${index}.values` });
  const [draft, setDraft] = useState("");
  const optionErrors = errors.options?.[index];
  const values = useWatch({ control, name: `options.${index}.values` }) ?? [];

  const addValues = () => {
    // "S, M, L" adds three.
    const taken = new Set(values.map((v) => v.value.trim().toLowerCase()));
    const fresh = draft
      .split(",")
      .map((s) => s.trim())
      .filter((s, i, all) => s && !taken.has(s.toLowerCase()) && all.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i);
    fresh.slice(0, 40 - fields.length).forEach((value) => append({ id: null, value, priceDelta: 0 }, { shouldFocus: false }));
    setDraft("");
  };

  return (
    <div className="option-card">
      <div className="option-card-head">
        <label>
          <span>OPTION {index + 1}</span>
          <input placeholder="e.g. Size" aria-invalid={optionErrors?.name ? true : undefined} {...register(`options.${index}.name`)} />
        </label>
        {canRemove && (
          <button type="button" className="icon-button danger" aria-label="Remove this option" onClick={onRemove}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {optionErrors?.name?.message && <span className="field-error">{optionErrors.name.message}</span>}
      <ul className="option-values">
        {fields.map((field, j) => {
          const valueError = optionErrors?.values?.[j];
          return (
            <li key={field.id} className="option-value">
              <input aria-label="Value" aria-invalid={valueError?.value ? true : undefined} {...register(`options.${index}.values.${j}.value`)} />
              <span className="option-delta" title={`Added to the price (${currency})`}>
                <span>±</span>
                <input type="number" inputMode="decimal" step="0.01" aria-label="Price change" {...register(`options.${index}.values.${j}.priceDelta`, { setValueAs: (v) => (v === "" || v === null ? 0 : Number(v)) })} />
              </span>
              <button type="button" className="icon-button" aria-label={`Remove ${values[j]?.value ?? "this value"}`} onClick={() => remove(j)}>
                <X size={12} />
              </button>
              {(valueError?.value?.message ?? valueError?.priceDelta?.message) && <span className="field-error">{valueError?.value?.message ?? valueError?.priceDelta?.message}</span>}
            </li>
          );
        })}
        <li className="option-value option-value-add">
          <input
            placeholder={fields.length ? "Add a value…" : "Values, e.g. S, M, L"}
            aria-label="Add values (separate with commas)"
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addValues();
              }
            }}
            onBlur={() => draft.trim() && addValues()}
          />
          <button type="button" className="button button-ghost" onClick={addValues} disabled={!draft.trim() || fields.length >= 40}>
            <Plus size={12} /> Add
          </button>
        </li>
      </ul>
      {(optionErrors?.values?.message ?? optionErrors?.values?.root?.message) && <span className="field-error">{optionErrors?.values?.message ?? optionErrors?.values?.root?.message}</span>}
    </div>
  );
}

const BULK_FIELDS = [
  { key: "sellingPrice", label: "Set price", empty: "Empty = the product's price" },
  { key: "costPrice", label: "Set cost", empty: "Empty = the product's cost" },
  { key: "lowStockThreshold", label: "Set low-stock level", empty: "Empty = the product's level" },
  { key: "onHand", label: "Set stock", empty: "Quantity on hand" },
] as const;

/** Changes the selected variants together: a price, cost, level or stock, or switches them on / off. */
function BulkBar({ count, step, onApply, onClear }: { count: number; step: string; onApply: (patch: Partial<Row>) => void; onClear: () => void }) {
  const [field, setField] = useState<(typeof BULK_FIELDS)[number]["key"]>("sellingPrice");
  const [value, setValue] = useState("");
  const current = BULK_FIELDS.find((f) => f.key === field)!;
  return (
    <div className="matrix-bulk" role="group" aria-label="Change the selected variants">
      <strong>{count} selected</strong>
      <select aria-label="What to change" value={field} onChange={(e) => setField(e.target.value as typeof field)}>
        {BULK_FIELDS.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </select>
      <input type="number" inputMode="decimal" min="0" step={field === "onHand" || field === "lowStockThreshold" ? step : "0.01"} placeholder={current.empty} aria-label={current.label} value={value} onChange={(e) => setValue(e.target.value)} />
      <button
        type="button"
        className="button"
        disabled={field === "onHand" && value.trim() === ""}
        onClick={() => {
          onApply({ [field]: numberOrNull(value) });
          setValue("");
        }}
      >
        Apply
      </button>
      <span className="matrix-bulk-sep" aria-hidden />
      <button type="button" className="button button-ghost" onClick={() => onApply({ enabled: true })}>Switch on</button>
      <button type="button" className="button button-ghost" onClick={() => onApply({ enabled: false })}>Switch off</button>
      <button type="button" className="icon-button" aria-label="Clear the selection" onClick={onClear}><X size={14} /></button>
    </div>
  );
}
