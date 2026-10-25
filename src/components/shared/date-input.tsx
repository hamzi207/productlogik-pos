"use client";

import type { InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
import { formatDay } from "@/lib/format";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "className"> & {
  value: string;
  /** Classes for the visible box (e.g. "field-input doc-date"). */
  className?: string;
  placeholder?: string;
};

/**
 * A date field that reads "09 Nov 2026" whatever the browser's language. A plain date input shows the
 * browser's own order (11/09/2026 in English (US) is 9 November), so it sits invisibly over the label
 * and still opens the calendar and takes the keyboard.
 */
export function DateInput({ value, className, placeholder = "Pick a date", onClick, ...rest }: Props) {
  return (
    <span className={className ? `date-input ${className}` : "date-input"}>
      <span className={value ? "date-input-text" : "date-input-text date-input-empty"} aria-hidden="true">
        {value ? formatDay(value) : placeholder}
      </span>
      <CalendarDays size={14} aria-hidden="true" />
      <input
        type="date"
        value={value}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            // Older browsers: the input's own calendar button still works.
          }
          onClick?.(e);
        }}
        {...rest}
      />
    </span>
  );
}
