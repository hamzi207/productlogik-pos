"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { MobileSheet } from "@/components/quotes/mobile-sheet";
import { RANGE_LABEL, type RangeKey } from "@/lib/dashboard";
import { PHONE_QUERY, useMediaQuery } from "@/lib/hooks/use-media-query";
import type { WeekStart } from "@/lib/validations/settings.schema";

type Props = {
  range: RangeKey;
  /** The resolved dates (shop-local YYYY-MM-DD) the figures are for. */
  from: string;
  to: string;
  /** The shop's local date; later days can't be picked. */
  today: string;
  /** Shop setting: first calendar column (1 Monday, 6 Saturday, 7 Sunday). */
  weekStart: WeekStart;
  /** Other URL params to keep when the dates change (e.g. the reports' ?tag=). */
  keep?: Record<string, string>;
};

// ---- Plain calendar arithmetic on YYYY-MM-DD strings (UTC, so no timezone shifts) ----
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
};
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const addMonths = (iso: string, n: number) => {
  const d = toDate(monthStart(iso));
  d.setUTCMonth(d.getUTCMonth() + n);
  return toIso(d);
};

const fmtDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtFull = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtMonth = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
// Index = ISO day number (1 Monday … 7 Sunday).
const WEEKDAY = ["", "Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function rangeText(from: string, to: string | null) {
  if (!to || from === to) return fmtFull.format(toDate(from));
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${(sameYear ? fmtDay : fmtFull).format(toDate(from))} – ${fmtFull.format(toDate(to))}`;
}

type Preset = { key: string; label: string; range: RangeKey; from?: string; to?: string };

/** Shortcuts. The first five are named ranges; the rest are fixed dates (sent as custom). */
function presets(today: string): Preset[] {
  const lastMonthStart = addMonths(today, -1);
  return [
    { key: "today", label: RANGE_LABEL.today, range: "today" },
    { key: "yesterday", label: "Yesterday", range: "custom", from: addDays(today, -1), to: addDays(today, -1) },
    { key: "week", label: RANGE_LABEL.week, range: "week" },
    { key: "last7", label: "Last 7 days", range: "custom", from: addDays(today, -6), to: today },
    { key: "month", label: RANGE_LABEL.month, range: "month" },
    { key: "last30", label: "Last 30 days", range: "custom", from: addDays(today, -29), to: today },
    { key: "lastMonth", label: "Last month", range: "custom", from: lastMonthStart, to: addDays(monthStart(today), -1) },
    { key: "year", label: RANGE_LABEL.year, range: "year" },
    { key: "all", label: RANGE_LABEL.all, range: "all" },
  ];
}

/** Which shortcut the current selection is, if any. */
function activePreset(list: Preset[], range: RangeKey, from: string, to: string) {
  if (range !== "custom") return list.find((p) => p.range === range) ?? null;
  return list.find((p) => p.range === "custom" && p.from === from && p.to === to) ?? null;
}

/**
 * Date range for the dashboard figures: shortcuts plus a two-month calendar, kept in the URL (?range=&from=&to=).
 * Phones get a bottom sheet with one month instead of the popover (Phase 11).
 */
export function DateRangePicker({ range, from, to, today, weekStart, keep }: Props) {
  const phone = useMediaQuery(PHONE_QUERY);
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  // The range being picked in the calendar (end is null after the first click).
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState<string | null>(to);
  const [hover, setHover] = useState<string | null>(null);
  // The left-hand month shown; the right-hand one is the month after.
  const [view, setView] = useState(addMonths(to, -1));

  const list = presets(today);
  const current = activePreset(list, range, from, to);
  const label = current?.label ?? RANGE_LABEL.custom;

  const go = (query: Record<string, string>) => {
    setOpen(false);
    const qs = new URLSearchParams({ ...keep, ...query }).toString();
    startTransition(() => router.replace(`${pathname}?${qs}`, { scroll: false }));
  };

  const onOpenChange = (next: boolean) => {
    if (next) {
      // Start from what's shown now.
      setStart(from);
      setEnd(to);
      setHover(null);
      setView(addMonths(to, -1));
    }
    setOpen(next);
  };

  const pickPreset = (p: Preset) =>
    go(p.range === "custom" ? { range: "custom", from: p.from!, to: p.to! } : { range: p.range });

  const pickDay = (day: string) => {
    if (end === null) {
      // Second click closes the range (either direction).
      if (day < start) {
        setEnd(start);
        setStart(day);
      } else {
        setEnd(day);
      }
    } else {
      setStart(day);
      setEnd(null);
    }
  };

  // While choosing the end, the hovered day previews the range.
  const lo = end === null && hover ? (hover < start ? hover : start) : start;
  const hi = end === null ? (hover ? (hover < start ? start : hover) : start) : end;

  const weekdays = Array.from({ length: 7 }, (_, i) => WEEKDAY[((weekStart - 1 + i) % 7) + 1]);
  const month = (first: string) => {
    const isoDay = toDate(first).getUTCDay() || 7;
    const lead = (isoDay - weekStart + 7) % 7; // blanks before the 1st
    const days: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(d);
    return (
      <div className="cal-month" key={first}>
        <div className="cal-title">{fmtMonth.format(toDate(first))}</div>
        <div className="cal-grid" role="grid">
          {weekdays.map((w) => (
            <span key={w} className="cal-weekday">{w}</span>
          ))}
          {days.map((d, i) => {
            if (!d) return <span key={`blank-${i}`} />;
            const future = d > today;
            const inRange = d >= lo && d <= hi;
            const edge = d === lo || d === hi;
            const cls = ["cal-day", inRange && "in-range", edge && "edge", d === lo && "start", d === hi && "end", d === today && "today"]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={d}
                type="button"
                className={cls}
                disabled={future}
                onClick={() => pickDay(d)}
                onMouseEnter={() => setHover(d)}
                aria-label={fmtFull.format(toDate(d))}
                aria-pressed={edge}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const nextView = addMonths(view, 1);
  const canGoForward = addMonths(nextView, 1) <= monthStart(today);

  const triggerContent = (
    <>
      {pending ? <Loader2 size={14} className="animate-spin" /> : <CalendarRange size={14} />}
      <strong>{label}</strong>
      <span>{rangeText(from, to)}</span>
      <ChevronDown size={14} className="range-chevron" />
    </>
  );
  const triggerLabel = `Date range: ${label}, ${rangeText(from, to)}`;
  const presetButtons = list.map((p) => (
    <button
      key={p.key}
      type="button"
      role="option"
      aria-selected={current?.key === p.key}
      className={current?.key === p.key ? "active" : undefined}
      onClick={() => pickPreset(p)}
    >
      {p.label}
    </button>
  ));
  const nav = (
    <div className="cal-nav">
      <button type="button" className="icon-button" onClick={() => setView(addMonths(view, -1))} aria-label="Previous month">
        <ChevronLeft size={16} />
      </button>
      <button type="button" className="icon-button" onClick={() => setView(nextView)} disabled={!canGoForward} aria-label="Next month">
        <ChevronRight size={16} />
      </button>
    </div>
  );
  const picked = end === null ? `${rangeText(start, null)} – pick an end date` : rangeText(start, end);
  const apply = (
    <button
      type="button"
      className="button button-primary"
      disabled={end === null}
      onClick={() => end && go({ range: "custom", from: start, to: end })}
    >
      Apply
    </button>
  );

  if (phone) {
    return (
      <>
        <button
          type="button"
          className="range-trigger"
          data-state={open ? "open" : "closed"}
          aria-haspopup="dialog"
          aria-label={triggerLabel}
          onClick={() => onOpenChange(true)}
        >
          {triggerContent}
        </button>
        <MobileSheet
          open={open}
          onOpenChange={onOpenChange}
          variant="bottom"
          title="Date range"
          description="Pick a quick range, or tap a start and an end date."
          footer={
            <>
              <button type="button" className="button" onClick={() => setOpen(false)}>Cancel</button>
              <span className="sheet-done">{apply}</span>
            </>
          }
        >
          <div className="sheet-chips" role="listbox" aria-label="Quick ranges">{presetButtons}</div>
          {/* One month: the later one, which holds the end date. */}
          <div className="range-calendar range-sheet-calendar">
            {nav}
            <div className="cal-months">{month(nextView)}</div>
            <p className="range-sheet-picked">{picked}</p>
          </div>
        </MobileSheet>
      </>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button type="button" className="range-trigger" aria-label={triggerLabel}>
          {triggerContent}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="range-panel" align="end" sideOffset={8} collisionPadding={16}>
          <div className="range-presets" role="listbox" aria-label="Quick ranges">
            {presetButtons}
          </div>
          <div className="range-calendar" onMouseLeave={() => setHover(null)}>
            {nav}
            <div className="cal-months">
              {month(view)}
              {month(nextView)}
            </div>
            <div className="range-footer">
              <span>{picked}</span>
              <div>
                <button type="button" className="button" onClick={() => setOpen(false)}>Cancel</button>
                {apply}
              </div>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
