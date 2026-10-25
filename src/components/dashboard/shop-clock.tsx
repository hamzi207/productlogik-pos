"use client";

import { useMemo, useSyncExternalStore } from "react";
import { formatDate } from "@/lib/format";
import type { ClockStyle } from "@/lib/validations/settings.schema";

// One shared ticker for every mounted clock, aligned to whole seconds.
// The server snapshot is null, so nothing time-dependent is server-rendered
// (no hydration mismatch, no Date.now() during prerender).
let now: number | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function tick() {
  now = Date.now();
  listeners.forEach((l) => l());
  timer = setTimeout(tick, 1000 - (now % 1000));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) tick();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearTimeout(timer);
      now = null;
    }
  };
}

const getSnapshot = () => now;
const getServerSnapshot = () => null;

type Props = {
  timeZone: string;
  clockStyle: ClockStyle;
  /** Digital only: "16:05" instead of "4:05 PM". */
  hour24: boolean;
};

export function ShopClock({ timeZone, clockStyle, hour24 }: Props) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const formats = useMemo(
    () => ({
      time: new Intl.DateTimeFormat("en-US", hour24
        ? { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
        : { timeZone, hour: "numeric", minute: "2-digit", hourCycle: "h12" }),
      weekday: new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long" }),
      offset: new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }),
      hands: new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }),
    }),
    [timeZone, hour24],
  );

  if (current === null) {
    return <div className={`shop-clock shop-clock-${clockStyle} shop-clock-loading`} aria-hidden="true" />;
  }

  const date = new Date(current);
  const offset = formats.offset.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const zoneLabel = `${timeZone.replaceAll("_", " ")} · ${offset === "GMT" ? "UTC±00:00" : offset.replace("GMT", "UTC")}`;
  const dateLabel = `${formats.weekday.format(date)} ${formatDate(date, timeZone)}`;

  if (clockStyle === "analog") {
    const parts = Object.fromEntries(formats.hands.formatToParts(date).map((p) => [p.type, Number(p.value)]));
    const s = parts.second ?? 0;
    const m = (parts.minute ?? 0) + s / 60;
    const h = ((parts.hour ?? 0) % 12) + m / 60;
    return (
      <div className="shop-clock shop-clock-analog">
        <svg viewBox="0 0 200 200" role="img" aria-label={`${formats.time.format(date)}, ${dateLabel}`}>
          <circle className="clock-face" cx="100" cy="100" r="94" />
          {Array.from({ length: 60 }, (_, i) => (
            <line
              key={i}
              className={i % 5 === 0 ? "clock-tick-major" : "clock-tick"}
              x1="100"
              y1={i % 5 === 0 ? 14 : 16}
              x2="100"
              y2={i % 5 === 0 ? 26 : 21}
              transform={`rotate(${i * 6} 100 100)`}
            />
          ))}
          {[12, 3, 6, 9].map((n, i) => {
            const a = (i * Math.PI) / 2;
            return (
              <text key={n} className="clock-number" x={100 + 62 * Math.sin(a)} y={100 - 62 * Math.cos(a)}>
                {n}
              </text>
            );
          })}
          <line className="clock-hand-hour" x1="100" y1="112" x2="100" y2="54" transform={`rotate(${h * 30} 100 100)`} />
          <line className="clock-hand-minute" x1="100" y1="116" x2="100" y2="32" transform={`rotate(${m * 6} 100 100)`} />
          <line className="clock-hand-second" x1="100" y1="122" x2="100" y2="24" transform={`rotate(${s * 6} 100 100)`} />
          <circle className="clock-pin" cx="100" cy="100" r="4.5" />
        </svg>
        <div className="shop-clock-meta">
          <strong>{dateLabel}</strong>
          <span>{zoneLabel}</span>
        </div>
      </div>
    );
  }

  // "3:42 PM" → time "3:42", period "PM"; 24-hour gives "15:42" and no period.
  // Seconds only show on the analog second hand.
  const timeParts = formats.time.formatToParts(date);
  const hhmm = timeParts.filter((p) => p.type === "hour" || p.type === "minute" || p.type === "literal").map((p) => p.value).join("").trim();
  const period = timeParts.find((p) => p.type === "dayPeriod")?.value;
  return (
    <div className="shop-clock shop-clock-digital">
      <time dateTime={date.toISOString()} className="shop-clock-time">
        {hhmm}
        {period && <span className="shop-clock-period">{period}</span>}
      </time>
      <div className="shop-clock-meta">
        <strong>{dateLabel}</strong>
        <span>{zoneLabel}</span>
      </div>
    </div>
  );
}
