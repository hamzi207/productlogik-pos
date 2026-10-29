"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Loader2, Search, Trash2 } from "lucide-react";
import { LOOKUP_DELAY_MS } from "@/lib/search-delay";
import type { PickerItemsResponse } from "@/lib/types/quote";
import { formatQty } from "@/lib/uom";

// RF-21.1: the products a kit is made of. Search (variants as products, no kits), then set how many of
// each one kit holds, in that product's own unit.

/** What the editor shows for a component (from the kit's saved parts or from the search). */
export type KitPartInfo = { name: string; sku: string; unit: string | null; available: number | null };

type Row = { itemId: string; quantity: number };

type Props = {
  value: Row[];
  onChange: (next: Row[]) => void;
  info: Record<string, KitPartInfo>;
  onInfo: (id: string, info: KitPartInfo) => void;
  /** The kit itself (it can't be its own component). */
  kitId?: string;
  /** Stock is the document store's with more than one store. */
  store: string | null;
  error?: string;
  rowErrors?: (string | undefined)[];
};

export function KitComponents({ value, onChange, info, onInfo, kitId, store, error, rowErrors }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ q: string; items: (KitPartInfo & { id: string })[] }>({ q: "", items: [] });
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim();
  const loading = open && q !== "" && results.q !== q;

  useEffect(() => {
    if (!open || !q) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q, flat: "1" });
      if (store) params.set("store", store);
      fetch(`/api/quote-items?${params}`, { signal: ctrl.signal })
        .then((res) => (res.ok ? (res.json() as Promise<PickerItemsResponse>) : Promise.reject()))
        .then((body) =>
          setResults({
            q,
            items: body.results.flatMap((r) =>
              r.kind === "item" && !r.item.is_kit && r.item.id !== kitId
                ? [{
                    id: r.item.id,
                    name: r.item.variant_label ? `${r.item.name} · ${r.item.variant_label}` : r.item.name,
                    sku: r.item.sku,
                    unit: r.item.units[0]?.code ?? null,
                    available: r.item.quantity_on_hand - r.item.reserved_quantity,
                  }]
                : [],
            ),
          }),
        )
        .catch(() => !ctrl.signal.aborted && setResults({ q, items: [] }));
    }, LOOKUP_DELAY_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, q, store, kitId]);

  const pick = (item: KitPartInfo & { id: string }) => {
    onInfo(item.id, item);
    if (!value.some((r) => r.itemId === item.id)) onChange([...value, { itemId: item.id, quantity: 1 }]);
    setQuery("");
    input.current?.focus();
  };
  const listed = new Set(value.map((r) => r.itemId));

  return (
    <div className="compatibility kit-components">
      <div className="unit-packs-head">
        <div>
          <h3>Products in this kit</h3>
          <p>A kit has no stock of its own. Selling one takes these products from stock, and its stock is the whole kits they make.</p>
        </div>
      </div>
      <div className="kit-search">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        <input
          ref={input}
          aria-label="Search products to add to the kit"
          placeholder="Search products by name, SKU or barcode…"
          value={query}
          maxLength={100}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Inside the product form: Enter picks the first match instead of saving.
              e.preventDefault();
              const first = results.q === q ? results.items.find((i) => !listed.has(i.id)) : undefined;
              if (first) pick(first);
            }
          }}
        />
        {open && q && !loading && (
          <ul className="kit-search-menu" role="listbox" aria-label="Products">
            {results.items.length === 0 && <li className="line-search-empty">No products match.</li>}
            {results.items.map((item) => (
              <li
                key={item.id}
                role="option"
                aria-selected={false}
                aria-disabled={listed.has(item.id)}
                className={listed.has(item.id) ? "disabled" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => !listed.has(item.id) && pick(item)}
              >
                <Box size={14} />
                <span className="line-search-info">
                  <strong>{item.name}</strong>
                  <span>
                    <span className="mono">{item.sku}</span> · {formatQty(Math.max(item.available ?? 0, 0), item.unit ?? undefined)} available
                    {listed.has(item.id) ? " · in the kit" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.length === 0 ? (
        <p className="unit-packs-empty"><Box size={14} /> No products yet. Search above to add the first one.</p>
      ) : (
        <ul className="kit-rows">
          {value.map((row, i) => {
            const part = info[row.itemId];
            const makes = part?.available != null && row.quantity > 0 ? Math.floor(Math.max(part.available, 0) / row.quantity + 1e-9) : null;
            return (
              <li key={row.itemId} className="kit-row">
                <span className="line-search-info">
                  <strong>{part?.name ?? "Product"}</strong>
                  <span>
                    <span className="mono">{part?.sku}</span>
                    {makes !== null && ` · ${formatQty(Math.max(part!.available!, 0), part?.unit ?? undefined)} available, enough for ${makes}`}
                  </span>
                </span>
                <label>
                  <span className="sr-only">Quantity of {part?.name ?? "this product"} per kit</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={Number.isFinite(row.quantity) ? row.quantity : ""}
                    aria-invalid={rowErrors?.[i] ? true : undefined}
                    onChange={(e) => onChange(value.map((r, j) => (j === i ? { ...r, quantity: e.target.value === "" ? Number.NaN : Number(e.target.value) } : r)))}
                  />
                  <span className="kit-unit">{part?.unit ?? ""}</span>
                </label>
                <button type="button" className="icon-button danger" aria-label={`Take ${part?.name ?? "this product"} out of the kit`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </button>
                {rowErrors?.[i] && <span className="field-error">{rowErrors[i]}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
