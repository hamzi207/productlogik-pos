import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { CATEGORY_COLORS, isCategoryColor } from "@/lib/category-colors";
import type { CustomerTag } from "@/lib/customer-lists";

/** The chip colour (--tag, shared with the console's organization tags); slate when the tag has none. */
export const tagStyle = (color: string | null | undefined) =>
  ({ "--tag": isCategoryColor(color) ? CATEGORY_COLORS[color] : "var(--slate-500)" }) as CSSProperties;

/** A customer's tags as small coloured chips (RF-19.2); nothing when there are none. */
export function TagChips({ tagIds, tags }: { tagIds: string[]; tags: CustomerTag[] }) {
  const shown = tags.filter((t) => tagIds.includes(t.id));
  if (shown.length === 0) return null;
  return (
    <span className="tag-chips">
      {shown.map((t) => (
        <span key={t.id} className="tag-chip" style={tagStyle(t.color)}>
          {t.name}
        </span>
      ))}
    </span>
  );
}

/** Toggle buttons for choosing a customer's tags in the customer dialog. */
export function TagPicker({ tags, value, onChange, id }: { tags: CustomerTag[]; value: string[]; onChange: (next: string[]) => void; id?: string }) {
  return (
    <div className="tag-picker" role="group" aria-labelledby={id}>
      {tags.map((t) => {
        const on = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            className={`tag-chip tag-toggle${on ? " is-on" : ""}`}
            style={tagStyle(t.color)}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== t.id) : [...value, t.id])}
          >
            {on ? <Check size={12} /> : <span className="tag-dot" aria-hidden="true" />}
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
