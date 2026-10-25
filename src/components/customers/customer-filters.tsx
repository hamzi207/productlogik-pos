"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { SEARCH_DELAY_MS } from "@/lib/search-delay";
import { tagStyle } from "./customer-tags";
import type { CustomerTag, CustomerTypeOption } from "@/lib/customer-lists";

/** Search + type and tag filters, kept in the URL (?q=&type=&tag=) like the inventory filters. */
export function CustomerFilters({ types, tags }: { types: CustomerTypeOption[]; tags: CustomerTag[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const type = params.get("type") ?? "";
  const tag = params.get("tag") ?? "";
  // Active types, plus the filtered one if it was archived since.
  const pills = types.filter((t) => !t.is_archived || t.name === type).map((t) => t.name);
  const activeTag = tags.find((t) => t.id === tag);
  const urlSearch = params.get("q") ?? "";
  const [search, setSearch] = useState(urlSearch);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page"); // a new filter or sort starts again at page 1
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => update({ q: search.trim() }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on typing
  }, [search]);

  return (
    <div className="customer-filters">
      <div className="inventory-search">
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, contact, phone, email or NTN..."
          aria-label="Search customers"
          maxLength={100}
        />
        {search && (
          <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setSearch("")}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="customer-filter-row">
        <div className="category-pills" role="group" aria-label="Customer type">
          {["", ...pills].map((t) => (
            <button
              key={t || "all"}
              type="button"
              className={type === t ? "active" : ""}
              aria-pressed={type === t}
              onClick={() => update({ type: t })}
            >
              {t || "All customers"}
            </button>
          ))}
        </div>
        {tags.length > 0 && (
          <label className={`tag-filter${activeTag ? " is-on" : ""}`} style={activeTag ? tagStyle(activeTag.color) : undefined}>
            <span className="sr-only">Tag</span>
            <select value={activeTag ? tag : ""} onChange={(e) => update({ tag: e.target.value })}>
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
