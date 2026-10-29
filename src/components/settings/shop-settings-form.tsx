"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlarmClock, Clock, Coins, FileText, ImageIcon, Phone, Printer, Receipt } from "lucide-react";
import { updateShopSettings } from "@/lib/actions/settings";
import { useUnsavedSettings } from "./unsaved-settings";
import { formatMoney } from "@/lib/format";
import { notify } from "@/lib/notify";
import { DEFAULT_TIMEZONE, type TimeZoneGroup } from "@/lib/timezones";
import {
  CLOCK_STYLES,
  CURRENCIES,
  PRINT_FORMAT_LABEL,
  PRINT_FORMATS,
  shopSettingsSchema,
  WEEK_START_LABEL,
  WEEK_STARTS,
  type ShopSettingsInput,
} from "@/lib/validations/settings.schema";

const onOff = (on: boolean) => (on ? "On" : "Off");

/**
 * "Settings saved" names each changed setting as "<label> updated to <value>", in the order the
 * cards show them; settings that weren't changed aren't mentioned.
 */
const CHANGE_TEXT: Record<keyof ShopSettingsInput, [label: string, value: (v: ShopSettingsInput) => string]> = {
  currency: ["Currency symbol", (v) => v.currency],
  showPaisa: ["Show paisa", (v) => onOff(v.showPaisa)],
  taxRate: ["Tax rate", (v) => `${v.taxRate}%`],
  pricesIncludeTax: ["Selling prices include tax", (v) => onOff(v.pricesIncludeTax)],
  quoteValidityDays: ["Quotation valid for", (v) => `${v.quoteValidityDays} day${v.quoteValidityDays === 1 ? "" : "s"}`],
  printFormat: ["Print format", (v) => PRINT_FORMAT_LABEL[v.printFormat]],
  imagesOnDrafts: ["Product images on estimates", (v) => onOff(v.imagesOnDrafts)],
  imagesOnQuotations: ["Product images on quotations", (v) => onOff(v.imagesOnQuotations)],
  imagesOnInvoices: ["Product images on invoices", (v) => onOff(v.imagesOnInvoices)],
  imagesOnPdf: ["Product images on the A4 PDF", (v) => onOff(v.imagesOnPdf)],
  imagesOnShare: ["Product images on the customer link", (v) => onOff(v.imagesOnShare)],
  allowInternationalPhones: ["Allow international numbers", (v) => onOff(v.allowInternationalPhones)],
  timezone: ["Shop timezone", (v) => v.timezone],
  weekStart: ["First day of the week", (v) => WEEK_START_LABEL[v.weekStart]],
  showClock: ["Show clock on dashboard", (v) => onOff(v.showClock)],
  clockStyle: ["Clock design", (v) => (v.clockStyle === "analog" ? "Analog" : "Digital")],
  clock24Hour: ["Time format", (v) => (v.clock24Hour ? "24-hour" : "12-hour")],
  showOverviewLogo: ["Show logo on Overview", (v) => onOff(v.showOverviewLogo)],
};

/** One line per changed setting, e.g. "Print format updated to 80mm POS slip."; empty when nothing changed. */
function describeChanges(before: ShopSettingsInput, after: ShopSettingsInput, fields: (keyof ShopSettingsInput)[]) {
  return (Object.keys(CHANGE_TEXT) as (keyof ShopSettingsInput)[])
    .filter((k) => fields.includes(k) && before[k] !== after[k])
    .map((k) => `${CHANGE_TEXT[k][0]} updated to ${CHANGE_TEXT[k][1](after)}.`)
    .join("\n");
}

/** The cards, by Settings tab (Localization, POS, Documents, Printing). */
export type SettingsSection = "currency" | "tax" | "validity" | "printFormat" | "productImages" | "phones" | "timezone" | "clock";

const SECTION_FIELDS: Record<SettingsSection, (keyof ShopSettingsInput)[]> = {
  currency: ["currency", "showPaisa"],
  tax: ["taxRate", "pricesIncludeTax"],
  validity: ["quoteValidityDays"],
  printFormat: ["printFormat"],
  productImages: ["imagesOnDrafts", "imagesOnQuotations", "imagesOnInvoices", "imagesOnPdf", "imagesOnShare"],
  phones: ["allowInternationalPhones"],
  timezone: ["timezone", "weekStart"],
  clock: ["showOverviewLogo", "showClock", "clockStyle", "clock24Hour"],
};

type Props = {
  /** Cards shown, in this order of the form; only their settings are saved. */
  sections: SettingsSection[];
  /** Named in the save bar, e.g. "Localization". */
  label: string;
  initial: ShopSettingsInput;
  /** Built on the server so labels match between SSR and hydration. */
  timeZoneGroups: TimeZoneGroup[];
  /** Staff can see the settings but not change them. */
  canEdit: boolean;
  /** False when the page already says so (Settings → Documents). */
  readOnlyNote?: boolean;
  /** Superadmin console: save to this organization (audited). */
  tenantId?: string;
};

export function ShopSettingsForm({ sections, label, initial, timeZoneGroups, canEdit, readOnlyNote = true, tenantId }: Props) {
  const has = (section: SettingsSection) => sections.includes(section);
  // Other tabs may stay mounted with older values: only this tab's own settings are sent.
  const fields = sections.flatMap((section) => SECTION_FIELDS[section]);
  const pick = (values: ShopSettingsInput) =>
    Object.fromEntries(fields.map((k) => [k, values[k]])) as Partial<ShopSettingsInput>;
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty, defaultValues: saved },
  } = useForm<ShopSettingsInput>({
    resolver: zodResolver(shopSettingsSchema),
    defaultValues: initial,
  });

  const [currency, showPaisa, showClock, clockStyle, imagesOnDrafts, imagesOnQuotations, imagesOnInvoices] = useWatch({
    control,
    name: ["currency", "showPaisa", "showClock", "clockStyle", "imagesOnDrafts", "imagesOnQuotations", "imagesOnInvoices"],
  });
  const anyImages = imagesOnDrafts || imagesOnQuotations || imagesOnInvoices;
  const preview = formatMoney(12500, { currency, showPaisa });

  const persist = async (values: ShopSettingsInput) => {
    setServerError(null);
    const result = await updateShopSettings(pick(values), tenantId);
    if (result.status === "error") {
      setServerError(result.message);
      notify.error("Settings not saved", result.message);
      return false;
    }
    // Compared with the last saved values, so a setting changed and then changed back isn't listed.
    // `saved` = defaultValues, which reset() moves to the values just saved.
    const changes = describeChanges({ ...initial, ...saved } as ShopSettingsInput, values, fields);
    reset(values);
    notify.success("Settings saved", changes || "Nothing was changed.");
    return true;
  };
  const onSubmit = handleSubmit(persist);
  // Saved only from the page's save bar (or Enter in a field); see unsaved-settings.tsx.
  useUnsavedSettings(
    `shop-settings-${sections.join("-")}`,
    label,
    isDirty,
    () => new Promise<boolean>((resolve) => void handleSubmit(async (v) => resolve(await persist(v)), () => resolve(false))()),
    () => {
      setServerError(null);
      reset();
    },
  );

  return (
    <form className="settings-form" onSubmit={onSubmit} noValidate>
      {!canEdit && readOnlyNote && (
        <div className="form-alert form-alert-info" role="status">
          Only shop admins can change these settings.
        </div>
      )}
      {serverError && <div className="form-alert form-alert-error" role="alert">{serverError}</div>}

      <fieldset disabled={!canEdit || isSubmitting}>
        {has("currency") && (
        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><Coins size={18} /></span>
            <div>
              <h2>Currency</h2>
              <p>How prices appear on inventory, quotes and invoices.</p>
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">Currency symbol</span>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <div className="segmented" role="radiogroup" aria-label="Currency symbol">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={field.value === c}
                      className={field.value === c ? "active" : ""}
                      onClick={() => field.onChange(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>
          <label className="settings-row">
            <span className="settings-label">
              Show paisa
              <small>Off shows whole rupees only.</small>
            </span>
            <input type="checkbox" className="switch" {...register("showPaisa")} />
          </label>
          <div className="settings-preview">Preview: <strong>{preview}</strong></div>
        </section>
        )}

        {has("tax") && (
        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><Receipt size={18} /></span>
            <div>
              <h2>Tax</h2>
              <p>Applied to quotes and invoices. Use 0 if you don&apos;t charge tax.</p>
            </div>
          </div>
          <label className="settings-row">
            <span className="settings-label">Tax rate (GST / sales tax)</span>
            <span className="percent-input">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="100"
                aria-invalid={errors.taxRate ? true : undefined}
                {...register("taxRate", { valueAsNumber: true })}
              />
              <span>%</span>
            </span>
          </label>
          {errors.taxRate && <span className="field-error settings-error">{errors.taxRate.message}</span>}
          <label className="settings-row">
            <span className="settings-label">
              Selling prices include tax
              <small>Default for new products; each product can override it.</small>
            </span>
            <input type="checkbox" className="switch" {...register("pricesIncludeTax")} />
          </label>
        </section>
        )}

        {has("validity") && (
        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><FileText size={18} /></span>
            <div>
              <h2>Quotations</h2>
              <p>Products on an open quotation are reserved until it is cancelled, deleted or invoiced.</p>
            </div>
          </div>
          <label className="settings-row">
            <span className="settings-label">
              Quotation valid for
              <small>Shown on each quotation. Expired quotations keep their stock reserved until you act on them.</small>
            </span>
            <span className="percent-input days-input">
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                max="365"
                aria-invalid={errors.quoteValidityDays ? true : undefined}
                {...register("quoteValidityDays", { valueAsNumber: true })}
              />
              <span>days</span>
            </span>
          </label>
          {errors.quoteValidityDays && <span className="field-error settings-error">{errors.quoteValidityDays.message}</span>}
        </section>
        )}

        {has("printFormat") && (
        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><Printer size={18} /></span>
            <div>
              <h2>Print format</h2>
              <p>Used by the print button and the Share menu on drafts, quotations and invoices.</p>
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">
              Print format
              <small>
                What quotations, invoices and drafts offer: an A4 PDF to view or download, or an 80mm slip printed straight from
                the screen on a receipt printer. The customer link always shows the A4 version.
              </small>
            </span>
            <Controller
              control={control}
              name="printFormat"
              render={({ field }) => (
                <div className="segmented" role="radiogroup" aria-label="Print format">
                  {PRINT_FORMATS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="radio"
                      aria-checked={field.value === f}
                      className={field.value === f ? "active" : ""}
                      onClick={() => field.onChange(f)}
                    >
                      {PRINT_FORMAT_LABEL[f]}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>
        </section>
        )}

        {has("productImages") && (
        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><ImageIcon size={18} /></span>
            <div>
              <h2>Product images on documents</h2>
              <p>A small photo beside each product line. Choose the documents, then where they show the photos: the A4 PDF, the customer link or both. Products without an image just show their name.</p>
            </div>
          </div>
          <label className="settings-row">
            <span className="settings-label">
              Estimates
              <small>Drafts you print or share before they become a quotation.</small>
            </span>
            <input type="checkbox" className="switch" {...register("imagesOnDrafts")} />
          </label>
          <label className="settings-row">
            <span className="settings-label">
              Quotations
              <small>Helps the customer see what they&apos;re being offered.</small>
            </span>
            <input type="checkbox" className="switch" {...register("imagesOnQuotations")} />
          </label>
          <label className="settings-row">
            <span className="settings-label">
              Invoices
              <small>The 80mm POS slip never shows images.</small>
            </span>
            <input type="checkbox" className="switch" {...register("imagesOnInvoices")} />
          </label>
          {/* Where the photos show only matters once a document above shows them. */}
          {anyImages ? (
            <>
              <label className="settings-row">
                <span className="settings-label">
                  On the A4 PDF
                  <small>The PDF you download, print or attach to an email.</small>
                </span>
                <input type="checkbox" className="switch" {...register("imagesOnPdf")} />
              </label>
              <label className="settings-row">
                <span className="settings-label">
                  On the customer link
                  <small>The page the customer opens from the WhatsApp or email link.</small>
                </span>
                <input type="checkbox" className="switch" {...register("imagesOnShare")} />
              </label>
            </>
          ) : (
            <div className="settings-row">
              <span className="settings-label">
                <small>Switch on estimates, quotations or invoices above, then choose where their photos show: the A4 PDF, the customer link or both.</small>
              </span>
            </div>
          )}
        </section>
        )}

        {has("phones") && (
        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><Phone size={18} /></span>
            <div>
              <h2>Phone numbers</h2>
              <p>Pakistani numbers (e.g. 0300-1234567) are always accepted.</p>
            </div>
          </div>
          <label className="settings-row">
            <span className="settings-label">
              Allow international numbers
              <small>For overseas clients. Numbers must start with + and a country code, e.g. +971501234567.</small>
            </span>
            <input type="checkbox" className="switch" {...register("allowInternationalPhones")} />
          </label>
        </section>
        )}

        {has("timezone") && (
        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><Clock size={18} /></span>
            <div>
              <h2>Timezone &amp; week</h2>
              <p>Dates and times on quotes, invoices and the dashboard use this timezone.</p>
            </div>
          </div>
          <label className="settings-row">
            <span className="settings-label">
              Shop timezone
              <small>Default is Pakistan Time ({DEFAULT_TIMEZONE}, UTC+05:00).</small>
            </span>
            <select
              className="filter-select timezone-select"
              aria-invalid={errors.timezone ? true : undefined}
              {...register("timezone")}
            >
              {timeZoneGroups.map((g) => (
                <optgroup key={g.region} label={g.region}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {errors.timezone && <span className="field-error settings-error">{errors.timezone.message}</span>}
          <div className="settings-row">
            <span className="settings-label">
              First day of the week
              <small>Used for &ldquo;This week&rdquo; on the dashboard and in the date picker&apos;s calendar.</small>
            </span>
            <Controller
              control={control}
              name="weekStart"
              render={({ field }) => (
                <div className="segmented" role="radiogroup" aria-label="First day of the week">
                  {WEEK_STARTS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={field.value === d}
                      className={field.value === d ? "active" : ""}
                      onClick={() => field.onChange(d)}
                    >
                      {WEEK_START_LABEL[d]}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>
        </section>
        )}

        {has("clock") && (
        <section className="card settings-card">
          <div className="settings-card-head">
            <span className="header-icon blue"><AlarmClock size={18} /></span>
            <div>
              <h2>Overview page</h2>
              <p>Your logo beside the greeting and a live clock in the shop timezone.</p>
            </div>
          </div>
          <label className="settings-row">
            <span className="settings-label">
              Show logo on Overview
              <small>Uses the logo from Settings → Profile. Nothing shows until one is uploaded.</small>
            </span>
            <input type="checkbox" className="switch" {...register("showOverviewLogo")} />
          </label>
          <label className="settings-row">
            <span className="settings-label">Show clock on dashboard</span>
            <input type="checkbox" className="switch" {...register("showClock")} />
          </label>
          <div className="settings-row">
            <span className="settings-label">
              Clock design
              {!showClock && <small>The clock is hidden. Turn it on to see this design.</small>}
            </span>
            <Controller
              control={control}
              name="clockStyle"
              render={({ field }) => (
                <div className="segmented" role="radiogroup" aria-label="Clock design">
                  {CLOCK_STYLES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={field.value === s}
                      className={field.value === s ? "active" : ""}
                      onClick={() => field.onChange(s)}
                    >
                      {s === "digital" ? "Digital" : "Analog"}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>
          {clockStyle === "digital" && (
            <div className="settings-row">
              <span className="settings-label">
                Time format
                <small>12-hour shows 4:05 PM; 24-hour shows 16:05.</small>
              </span>
              <Controller
                control={control}
                name="clock24Hour"
                render={({ field }) => (
                  <div className="segmented" role="radiogroup" aria-label="Time format">
                    {[false, true].map((is24) => (
                      <button
                        key={String(is24)}
                        type="button"
                        role="radio"
                        aria-checked={field.value === is24}
                        className={field.value === is24 ? "active" : ""}
                        onClick={() => field.onChange(is24)}
                      >
                        {is24 ? "24-hour" : "12-hour"}
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>
          )}
        </section>
        )}
      </fieldset>
    </form>
  );
}
