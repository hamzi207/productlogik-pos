"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeftRight, Banknote, ChevronRight, Loader2, Search, UserPlus, Users, X } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import { LOOKUP_DELAY_MS } from "@/lib/search-delay";
import type { CustomerOption, CustomerOptionsResponse } from "@/lib/types/quote";
import { CustomerAvatar, CustomerTypeBadge } from "@/components/customers/customer-badges";
import { CustomerDialog } from "@/components/customers/customer-dialog";
import { MobileSheet } from "./mobile-sheet";

type Props = {
  value: CustomerOption | null;
  onChange: (customer: CustomerOption | null) => void;
  allowInternationalPhones: boolean;
  /** The shop's walk-in / cash customer, for the quick-select button. */
  walkIn: CustomerOption | null;
  disabled?: boolean;
  /** Saved invoices: the customer can be swapped for another (Change) but never removed (no ×). */
  required?: boolean;
};

async function fetchCustomers(params: string, signal?: AbortSignal) {
  const res = await fetch(`/api/customers${params}`, { signal });
  if (!res.ok) throw new Error("Couldn't load customers.");
  return ((await res.json()) as CustomerOptionsResponse).customers;
}

/** Customers matching the query, fetched while `enabled`, 200ms after the last keystroke. */
function useCustomerSearch(enabled: boolean, query: string) {
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      const q = query.trim();
      fetchCustomers(q ? `?q=${encodeURIComponent(q)}` : "", ctrl.signal)
        .then((rows) => {
          setResults(rows);
          setActive(0);
        })
        .catch((err) => !ctrl.signal.aborted && setError(err.message))
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, LOOKUP_DELAY_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [enabled, query]);

  return { results, active, setActive, loading, error, setError };
}

/**
 * Searchable customer combobox, with "register new customer" in a modal.
 * On phones the search opens as a full-screen sheet.
 */
export function CustomerPicker({ value, onChange, allowInternationalPhones, walkIn, disabled, required }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  // `required`: searching for another customer while the current one stays chosen until one is picked.
  const [changing, setChanging] = useState(false);
  const { results, active, setActive, loading, error, setError } = useCustomerSearch(open || sheetOpen, query);

  const choose = (customer: CustomerOption) => {
    onChange(customer);
    setOpen(false);
    setSheetOpen(false);
    setChanging(false);
    setQuery("");
  };
  const keepCurrent = () => {
    setChanging(false);
    setOpen(false);
    setQuery("");
  };
  /** Into the search: the inline field, or on phones (field hidden) the search sheet. */
  const startSearch = () =>
    requestAnimationFrame(() => {
      if (inputRef.current?.offsetParent) inputRef.current.focus();
      else setSheetOpen(true);
    });
  const register = () => {
    setOpen(false);
    setSheetOpen(false);
    setRegistering(true);
  };

  const onRegistered = async (id: string) => {
    try {
      const [customer] = await fetchCustomers(`?id=${id}`);
      if (customer) choose(customer);
    } catch {
      setError("Customer saved, but couldn't be selected. Search for them by name.");
    }
  };

  if (value && !changing) {
    return (
      <div className="customer-picked">
        <CustomerAvatar name={value.name} />
        <div>
          <strong>{value.name}</strong>
          <span>
            {value.is_walk_in ? (
              "Cash sale · add the buyer's details below if you like"
            ) : (
              <>
                <CustomerTypeBadge type={value.customer_type} /> {formatPhone(value.whatsapp_number)}
                {Number(value.default_discount_percentage) > 0 && ` · ${Number(value.default_discount_percentage)}% default discount`}
              </>
            )}
          </span>
        </div>
        {!disabled && required && (
          <button
            type="button"
            className="button customer-change"
            title="Pick another customer for this invoice"
            onClick={() => {
              setChanging(true);
              startSearch();
            }}
          >
            <ArrowLeftRight size={13} /> Change
          </button>
        )}
        {!disabled && !required && (
          <button
            type="button"
            className="icon-button"
            aria-label="Change customer"
            title="Change customer"
            onClick={() => {
              onChange(null);
              startSearch();
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>
    );
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      if (changing) keepCurrent();
      else setOpen(false);
    }
  };
  const keepButton = (big: boolean) =>
    changing && value ? (
      <button type="button" className="button" onClick={keepCurrent} title={`Keep ${value.name} as the customer`}>
        <X size={big ? 16 : 14} /> Keep {value.is_walk_in ? "walk-in" : "current"}
      </button>
    ) : null;

  return (
    <div className="customer-combobox">
      <div className="customer-combobox-row">
      <div className="field-control">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined}
          aria-label="Customer"
          placeholder="Search customers by name, phone or NTN…"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          maxLength={100}
        />
      </div>
      {walkIn && (
        <button
          type="button"
          className="button walk-in-button"
          disabled={disabled}
          onClick={() => choose(walkIn)}
          title="Bill a walk-in / cash customer without creating a profile"
        >
          <Banknote size={14} /> Walk-in / Cash
        </button>
      )}
      {keepButton(false)}
      </div>
      {open && (
        <div className="combobox-menu">
          <ul id={listId} role="listbox" aria-label="Customers">
            {results.map((c, i) => (
              <li
                key={c.id}
                id={`${listId}-${c.id}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
              >
                <CustomerAvatar name={c.name} />
                <div>
                  <strong>{c.name}</strong>
                  <span>{c.customer_type} · {formatPhone(c.whatsapp_number)}</span>
                </div>
              </li>
            ))}
          </ul>
          {!loading && results.length === 0 && (
            <div className="combobox-empty">
              <Users size={15} /> {error ?? (query.trim() ? "No customers match." : "No customers yet.")}
            </div>
          )}
          <button type="button" className="combobox-add" onMouseDown={(e) => e.preventDefault()} onClick={register}>
            <UserPlus size={14} /> Register a new customer
          </button>
        </div>
      )}

      {/* Phones: the field is a button that opens the full-screen search */}
      <div className="customer-phone">
        <button type="button" className="line-search-trigger" disabled={disabled} onClick={() => setSheetOpen(true)}>
          <Search size={18} /> <span>Choose a customer…</span> <ChevronRight size={18} />
        </button>
        {walkIn && (
          <button type="button" className="button walk-in-button" disabled={disabled} onClick={() => choose(walkIn)}>
            <Banknote size={16} /> Walk-in / Cash
          </button>
        )}
        {keepButton(true)}
      </div>
      <MobileSheet
        open={sheetOpen}
        onOpenChange={(next) => {
          setSheetOpen(next);
          if (!next) setQuery("");
          // Closing the sheet without a pick keeps the current customer.
          if (!next && changing) setChanging(false);
        }}
        title="Choose a customer"
        description="Search by name, phone or NTN, or bill a walk-in customer."
        initialFocus={sheetInputRef}
      >
        <div className="sheet-search">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          <input
            ref={sheetInputRef}
            type="search"
            enterKeyHint="search"
            aria-label="Search customers"
            placeholder="Name, phone or NTN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
          />
        </div>
        <ul className="sheet-results" aria-label="Customers" aria-busy={loading}>
          {walkIn && (
            <li>
              <button type="button" className="sheet-result" onClick={() => choose(walkIn)}>
                <span className="product-thumbnail"><Banknote size={16} /></span>
                <span className="line-search-info">
                  <strong>Walk-in / Cash customer</strong>
                  <span>Bill without creating a profile</span>
                </span>
              </button>
            </li>
          )}
          {results.filter((c) => c.id !== walkIn?.id).map((c) => (
            <li key={c.id}>
              <button type="button" className="sheet-result" onClick={() => choose(c)}>
                <CustomerAvatar name={c.name} />
                <span className="line-search-info">
                  <strong>{c.name}</strong>
                  <span>{c.customer_type} · {formatPhone(c.whatsapp_number)}</span>
                </span>
              </button>
            </li>
          ))}
          {!loading && results.length === 0 && (
            <li className="sheet-empty">{error ?? (query.trim() ? "No customers match." : "No customers yet.")}</li>
          )}
          <li>
            <button type="button" className="sheet-result sheet-custom" onClick={register}>
              <UserPlus size={16} /> Register a new customer
            </button>
          </li>
        </ul>
      </MobileSheet>
      {error && !open && !sheetOpen && <span className="field-error">{error}</span>}
      <CustomerDialog
        open={registering}
        onOpenChange={setRegistering}
        allowInternationalPhones={allowInternationalPhones}
        onSaved={(id) => void onRegistered(id)}
      />
    </div>
  );
}
