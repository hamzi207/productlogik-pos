"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Box, Check, Loader2, PenLine, Plus, Search } from "lucide-react";
import { colorStyle } from "@/lib/category-colors";
import { formatMoney, type MoneyFormat } from "@/lib/format";
import { LOOKUP_DELAY_MS } from "@/lib/search-delay";
import { SINGLE_DOCUMENT_STORE, type DocumentStores } from "@/lib/stock";
import { formatQty } from "@/lib/uom";
import type { PickerItem, PickerItemsResponse } from "@/lib/types/quote";
import { MobileSheet } from "./mobile-sheet";

/** A main category, for the filter chips in the phone search (`color`: its RF-18.2 colour). */
export type CategoryChip = { id: string; name: string; color: string | null };

type Props = {
  money: MoneyFormat;
  /** Inventory ids already on the document (adding again adds 1 to the quantity). */
  addedIds: ReadonlySet<string>;
  onAdd: (item: PickerItem) => void;
  /** A line for something not in inventory, with this description. */
  onAddCustom: (description: string) => void;
  categories: CategoryChip[];
  /** The search also matches linked vehicles (Vehicle Fitment module on). */
  vehicleSearch: boolean;
  /** Phase 20: stock and prices are the document store's; other stores' stock is named. */
  stores?: DocumentStores;
};

/** Available = on hand − reserved on open quotations (at the document's store, with more than one). */
function Stock({ item, stores }: { item: PickerItem; stores: DocumentStores }) {
  const available = item.quantity_on_hand - item.reserved_quantity;
  const unit = item.units[0]?.code;
  const reserved = item.reserved_quantity > 0 ? ` · ${formatQty(item.reserved_quantity)} reserved` : "";
  const tone = available <= 0 ? "stock-out" : available <= item.low_stock_threshold ? "stock-low" : "in-stock";
  const here = stores.multi ? " here" : "";
  // "Other stores: 15", with each store's figure on hover.
  const others = stores.multi ? Object.entries(item.store_stock).filter(([id, n]) => id !== stores.docStoreId && n > 0) : [];
  const elsewhere = others.reduce((sum, [, n]) => sum + n, 0);
  return (
    <span className={tone}>
      {available <= 0 ? `None available${here}` : `${formatQty(available, unit)} available${here}`}
      {reserved}
      {elsewhere > 0 && (
        <span className="stock-elsewhere" title={others.map(([id, n]) => `${stores.names[id] ?? "Store"}: ${formatQty(n, unit)}`).join("\n")}>
          {" "}· Other stores: {formatQty(elsewhere, unit)}
        </span>
      )}
    </span>
  );
}

/** Products matching the query (and category), fetched while `enabled`, 200ms after the last keystroke. */
function usePartSearch(enabled: boolean, query: string, category: string | null, store: string | null) {
  const q = query.trim();
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (store) params.set("store", store);
  const request = `/api/quote-items${params.size ? `?${params}` : ""}`;
  const [active, setActive] = useState(0);
  const [result, setResult] = useState<{ request: string; items: PickerItem[]; error: string | null }>({
    request: "",
    items: [],
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(request, { signal: ctrl.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error("Couldn't load products.");
          const body = (await res.json()) as PickerItemsResponse;
          setResult({ request, items: body.items, error: null });
          setActive(0);
        })
        .catch((err) => !ctrl.signal.aborted && setResult({ request, items: [], error: err.message }));
    }, LOOKUP_DELAY_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [enabled, request]);

  return { q, items: result.items, error: result.error, loading: enabled && result.request !== request, active, setActive };
}

/**
 * Search box at the top of the line items: type a name or SKU, click a product
 * to add it. Anything not in inventory can be added as a custom item.
 * On phones the box opens a full-screen search sheet instead.
 */
export function LineSearch({ money, addedIds, onAdd, onAddCustom, categories, vehicleSearch, stores = SINGLE_DOCUMENT_STORE }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { q, items, error, loading, active, setActive } = usePartSearch(open, query, null, stores.multi ? stores.docStoreId : null);
  // The last option adds the typed text as a custom item.
  const optionCount = items.length + 1;

  // Close the menu so the new line isn't hidden under it; typing reopens it.
  const add = (item: PickerItem) => {
    onAdd(item);
    setQuery("");
    setOpen(false);
  };
  const addCustom = () => {
    onAddCustom(q);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, optionCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (active < items.length) add(items[active]);
      else addCustom();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="line-search">
      <div className="line-search-box">
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-label="Search products to add"
          placeholder="Search products by name or SKU, then click to add…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          maxLength={100}
        />
        <button type="button" className="button" onClick={() => onAddCustom("")}>
          <PenLine size={14} /> Custom item
        </button>
      </div>

      {/* Phones: the box is a button that opens the full-screen search */}
      <div className="line-search-phone">
        <button type="button" className="line-search-trigger" onClick={() => setSheetOpen(true)}>
          <Search size={18} /> <span>Search products to add…</span>
        </button>
        <button type="button" className="button" onClick={() => onAddCustom("")} aria-label="Add a custom item">
          <PenLine size={16} /> Custom
        </button>
      </div>
      <PartSearchSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        money={money}
        addedIds={addedIds}
        onAdd={onAdd}
        onAddCustom={onAddCustom}
        categories={categories}
        vehicleSearch={vehicleSearch}
        stores={stores}
      />

      {open && (
        <ul id={listId} role="listbox" aria-label="Products" className="line-search-menu">
          {items.map((item, i) => (
            <li
              key={item.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => add(item)}
            >
              <span className="product-thumbnail"><Box size={15} /></span>
              <span className="line-search-info">
                <strong className="product-title">{item.name}</strong>
                <span><span className="mono">{item.sku}</span> · {item.category?.name ?? "Uncategorised"} · <Stock item={item} stores={stores} /></span>
              </span>
              <span className="line-search-price">
                {formatMoney(item.selling_price, money)}
                {addedIds.has(item.id) && <small>On this document · adds 1</small>}
              </span>
            </li>
          ))}
          {!loading && items.length === 0 && (
            <li className="line-search-empty" role="presentation">{error ?? (q ? "No products match." : "No products in inventory yet.")}</li>
          )}
          <li
            id={`${listId}-${items.length}`}
            role="option"
            aria-selected={active === items.length}
            className={`line-search-custom${active === items.length ? " active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(items.length)}
            onClick={addCustom}
          >
            <Plus size={14} />
            {q ? <>Add “{q}” as a custom item (not in inventory)</> : "Add a custom item (not in inventory)"}
          </li>
        </ul>
      )}
    </div>
  );
}

/**
 * Full-screen product search for phones: the field is focused on open, main
 * categories filter the list, and each tap adds a product (tapping again adds 1).
 * The sheet stays open so several products can be added in a row.
 */
function PartSearchSheet({
  open,
  onOpenChange,
  money,
  addedIds,
  onAdd,
  onAddCustom,
  categories,
  vehicleSearch,
  stores = SINGLE_DOCUMENT_STORE,
}: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const { q, items, error, loading } = usePartSearch(open, query, category, stores.multi ? stores.docStoreId : null);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setQuery("");
      setAdded(0);
    }
  };
  const addCustom = () => {
    onAddCustom(q);
    close(false);
  };

  return (
    <MobileSheet
      open={open}
      onOpenChange={close}
      title="Add products"
      description="Search your inventory and tap a product to add it."
      initialFocus={inputRef}
      footer={
        <button type="button" className="button button-primary sheet-done" onClick={() => close(false)}>
          {added > 0 ? `Done · ${added} added` : "Done"}
        </button>
      }
    >
      <div className="sheet-search">
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          aria-label="Search products"
          placeholder={vehicleSearch ? "Name, SKU or vehicle…" : "Name or SKU…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={100}
        />
      </div>
      {categories.length > 0 && (
        <div className="sheet-chips" role="group" aria-label="Category">
          <button type="button" className={category === null ? "active" : ""} aria-pressed={category === null} onClick={() => setCategory(null)}>
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={category === c.id ? "active" : ""}
              aria-pressed={category === c.id}
              onClick={() => setCategory(category === c.id ? null : c.id)}
            >
              {c.color && <span className="chip-dot" style={colorStyle(c.color)} aria-hidden />}
              {c.name}
            </button>
          ))}
        </div>
      )}
      <ul className="sheet-results" aria-label="Products" aria-busy={loading}>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="sheet-result"
              onClick={() => {
                onAdd(item);
                setAdded((n) => n + 1);
              }}
            >
              <span className="product-thumbnail"><Box size={16} /></span>
              <span className="line-search-info">
                <strong className="product-title">{item.name}</strong>
                <span><span className="mono">{item.sku}</span> · <Stock item={item} stores={stores} /></span>
              </span>
              <span className="line-search-price">
                {formatMoney(item.selling_price, money)}
                {addedIds.has(item.id) ? (
                  <small><Check size={11} /> Added · tap for +1</small>
                ) : (
                  <small className="sheet-add"><Plus size={11} /> Add</small>
                )}
              </span>
            </button>
          </li>
        ))}
        {!loading && items.length === 0 && (
          <li className="sheet-empty">{error ?? (q || category ? "No products match." : "No products in inventory yet.")}</li>
        )}
        <li>
          <button type="button" className="sheet-result sheet-custom" onClick={addCustom}>
            <Plus size={16} />
            {q ? <>Add “{q}” as a custom item</> : "Add a custom item (not in inventory)"}
          </button>
        </li>
      </ul>
    </MobileSheet>
  );
}
