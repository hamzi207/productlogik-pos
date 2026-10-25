// Display formatting shared by server and client components. A fixed locale
// keeps server-rendered HTML identical to what the browser hydrates.

/** How a shop shows amounts (tenants.currency / tenants.show_paisa). */
export type MoneyFormat = { currency: string; showPaisa: boolean };

const withPaisa = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wholeRupees = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "Rs. 12,500.00" / "PKR 12,500" depending on the shop's settings. */
export function formatMoney(amount: number, { currency, showPaisa }: MoneyFormat) {
  const sign = amount < 0 ? "-" : "";
  const digits = (showPaisa ? withPaisa : wholeRupees).format(Math.abs(amount));
  return `${sign}${currency} ${digits}`;
}

// One date format everywhere (owner, 2026-10-25): "09 Nov 2026". Built by hand so the day always has
// two digits and September stays "Sep" (some locales' short month is "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayParts = new Map<string, Intl.DateTimeFormat>();

/** "YYYY-MM-DD" for a moment, as the calendar day in `timeZone`. */
function isoDay(value: string | Date, timeZone: string) {
  let f = dayParts.get(timeZone);
  if (!f) dayParts.set(timeZone, (f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })));
  const p = Object.fromEntries(f.formatToParts(new Date(value)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** "09 Nov" for a "YYYY-MM-DD" day (chart axes, ranges within one year). */
export function formatDayMonth(day: string) {
  const [, m, d] = day.slice(0, 10).split("-");
  return `${d} ${MONTHS[Number(m) - 1]}`;
}

/** "09 Nov 2026" for a "YYYY-MM-DD" day (no timezone shift). */
export function formatDay(day: string) {
  return `${formatDayMonth(day)} ${day.slice(0, 4)}`;
}

/** "09 Nov 2026" in the shop's timezone (default Asia/Karachi). */
export function formatDate(value: string | Date, timeZone: string) {
  return formatDay(isoDay(value, timeZone));
}

/** "09 Nov 2026, 14:05" in `timeZone`. */
export function formatDateTime(value: string | Date, timeZone: string) {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  return `${formatDate(value, timeZone)}, ${time}`;
}

/** "Nov 2026" / "Nov" (month labels). */
export function formatMonth(day: string, withYear = true) {
  const m = MONTHS[Number(day.slice(5, 7)) - 1];
  return withYear ? `${m} ${day.slice(0, 4)}` : m;
}

/** Gross margin as a percentage of the selling price, or null when unpriced. */
export function marginPercent(cost: number, selling: number) {
  return selling > 0 ? ((selling - cost) / selling) * 100 : null;
}

// NHTSA stores makes upper-case. These read best kept as acronyms.
const ACRONYM_MAKES = new Set(["BMW", "GMC", "MINI", "AMC", "BYD", "MG", "FAW", "DFSK", "GWM", "BAIC", "ORA"]);

/** "MERCEDES-BENZ" → "Mercedes-Benz", "BMW" stays "BMW". */
export function formatMake(make: string) {
  if (ACRONYM_MAKES.has(make)) return make;
  return make.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

type VehicleLabel = { year: number; make: string; model: string; trim?: string | null };

/** "Toyota Corolla 2025" (trim, when present, goes before the year). */
export function formatVehicle(v: VehicleLabel) {
  return [formatMake(v.make), v.model, v.trim, v.year].filter(Boolean).join(" ");
}

/** [2019, 2020, 2021, 2023] → "2019–2021, 2023" */
function formatYears(years: number[]) {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    runs.push(start === sorted[i] ? String(start) : `${start}–${sorted[i]}`);
  }
  return runs.join(", ");
}

/**
 * One label per make/model with its years collapsed, e.g.
 * ["Ford F-150 2019–2022", "Toyota Corolla 2025"]. Sorted by make, then model.
 */
export function formatVehicleGroups(vehicles: VehicleLabel[]) {
  const groups = new Map<string, { label: string; years: number[] }>();
  for (const v of vehicles) {
    const label = [formatMake(v.make), v.model, v.trim].filter(Boolean).join(" ");
    const group = groups.get(label) ?? { label, years: [] };
    group.years.push(v.year);
    groups.set(label, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((g) => `${g.label} ${formatYears(g.years)}`);
}
