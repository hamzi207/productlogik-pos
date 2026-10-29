"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { Layers, Plus, X } from "lucide-react";
import { formatMoney, type MoneyFormat } from "@/lib/format";
import type { PickerGroup, PickerItem } from "@/lib/types/quote";
import { formatQty } from "@/lib/uom";
import { ModalSheet } from "@/components/shared/modal-sheet";

// Phase 21: picking a product group in line search opens this. One row of buttons per option, each showing
// the stock of the variants it leaves (given the other choices); once every option is chosen, Add puts
// that variant on the document.

type Props = {
  group: PickerGroup | null;
  money: MoneyFormat;
  /** "here" with more than one store (stock is the document store's). */
  storeNote: string;
  onAdd: (item: PickerItem) => void;
  onOpenChange: (open: boolean) => void;
};

const free = (v: PickerItem) => v.quantity_on_hand - v.reserved_quantity;

export function OptionPicker({ group, money, storeNote, onAdd, onOpenChange }: Props) {
  return (
    <Dialog.Root open={group !== null} onOpenChange={onOpenChange}>
      <ModalSheet className="modal option-picker">
        {group && <PickerBody key={group.id} group={group} money={money} storeNote={storeNote} onAdd={onAdd} />}
      </ModalSheet>
    </Dialog.Root>
  );
}

function PickerBody({ group, money, storeNote, onAdd }: Omit<Props, "group" | "onOpenChange"> & { group: PickerGroup }) {
  // An option with a single value (or a single variant left) is chosen already.
  const [chosen, setChosen] = useState<(string | null)[]>(() =>
    group.options.map((o, i) => {
      const used = new Set(group.variants.map((v) => v.option_values[i]));
      const values = o.values.filter((v) => used.has(v.id));
      return values.length === 1 ? values[0].id : null;
    }),
  );
  /** Variants that fit the choices, ignoring option `skip`. */
  const fitting = (skip: number | null, picks = chosen) =>
    group.variants.filter((v) => picks.every((id, i) => i === skip || id === null || v.option_values[i] === id));
  const match = chosen.every(Boolean) ? (fitting(null)[0] ?? null) : null;
  const prices = fitting(null).map((v) => v.selling_price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);

  return (
    <>
      <div className="modal-header">
        <div>
          {group.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- product photo on Supabase Storage
            <img className="option-picker-image" src={group.image_url} alt="" />
          ) : (
            <span className="header-icon blue"><Layers size={18} /></span>
          )}
          <div>
            <Dialog.Title asChild><h2>{group.name}</h2></Dialog.Title>
            <Dialog.Description asChild>
              <p>{group.category?.name ?? "Product"} · {group.variants.length} variants. Choose its options to add it.</p>
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close asChild>
          <button type="button" className="icon-button" aria-label="Close"><X size={16} /></button>
        </Dialog.Close>
      </div>
      <div className="modal-body option-picker-body">
        {group.options.map((option, i) => (
          <fieldset key={option.id} className="option-row">
            <legend>{option.name}</legend>
            <div className="option-buttons">
              {option.values.map((value) => {
                const left = fitting(i).filter((v) => v.option_values[i] === value.id);
                if (left.length === 0 && !group.variants.some((v) => v.option_values[i] === value.id)) return null;
                const stock = left.reduce((sum, v) => sum + Math.max(free(v), 0), 0);
                const selected = chosen[i] === value.id;
                return (
                  <button
                    key={value.id}
                    type="button"
                    className={`option-button${selected ? " selected" : ""}${stock <= 0 ? " empty" : ""}`}
                    aria-pressed={selected}
                    disabled={left.length === 0}
                    onClick={() => setChosen((prev) => prev.map((id, j) => (j === i ? (selected ? null : value.id) : id)))}
                  >
                    <strong>{value.value}</strong>
                    <small>{left.length === 0 ? "Not sold" : stock > 0 ? `${formatQty(stock)} ${storeNote}`.trim() : "None left"}</small>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="modal-footer option-picker-footer">
        <div className="option-picker-summary">
          {match ? (
            <>
              <strong>{match.variant_label}</strong>
              <span>
                <span className="mono">{match.sku}</span> · {free(match) > 0 ? `${formatQty(free(match), match.units[0]?.code)} available` : "None available"} · {formatMoney(match.selling_price, money)}
              </span>
            </>
          ) : (
            <span>
              Choose {group.options.filter((_, i) => !chosen[i]).map((o) => o.name.toLowerCase()).join(" and ")}
              {prices.length > 0 && ` · ${low === high ? formatMoney(low, money) : `${formatMoney(low, money)} – ${formatMoney(high, money)}`}`}
            </span>
          )}
        </div>
        <button type="button" className="button button-primary" disabled={!match} onClick={() => match && onAdd(match)}>
          <Plus size={14} /> Add
        </button>
      </div>
    </>
  );
}
