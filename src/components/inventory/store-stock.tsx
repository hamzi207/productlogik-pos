"use client";

import { Popover } from "radix-ui";
import { Warehouse } from "lucide-react";
import { availableElsewhere, stockAt, type StoreView } from "@/lib/stock";
import type { StoreStock } from "@/lib/stores";
import { formatQty } from "@/lib/uom";

/** "Other stores: 15" — opens a list of every store's stock (Phase 20). */
export function OtherStoresStock({ stock, view, unit }: { stock: StoreStock[]; view: StoreView; unit?: string }) {
  const elsewhere = availableElsewhere(stock, view.currentId);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="store-stock-trigger" title="Stock in every store">
          <Warehouse size={11} /> Other stores: {formatQty(elsewhere, unit)}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="store-stock-panel" align="start" sideOffset={6} collisionPadding={12}>
          <StoreStockTable stock={stock} view={view} unit={unit} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Every store's on hand / reserved / available; the current store first and marked. */
export function StoreStockTable({ stock, view, unit }: { stock: StoreStock[]; view: StoreView; unit?: string }) {
  const stores = [...view.stores].sort((a, b) => Number(b.id === view.currentId) - Number(a.id === view.currentId));
  return (
    <table className="store-stock-table">
      <thead>
        <tr>
          <th>STORE</th>
          <th>ON HAND</th>
          <th>RESERVED</th>
          <th>AVAILABLE</th>
        </tr>
      </thead>
      <tbody>
        {stores.map((s) => {
          const at = stockAt(stock, s.id);
          if (!s.is_active && at.onHand === 0) return null;
          return (
            <tr key={s.id} className={s.id === view.currentId ? "is-current" : undefined}>
              <td>
                {s.name}
                {s.id === view.currentId && <span className="badge badge-blue">This store</span>}
                {!s.is_active && <span className="badge">Switched off</span>}
              </td>
              <td>{formatQty(at.onHand, unit)}</td>
              <td>{at.reserved > 0 ? formatQty(at.reserved, unit) : "—"}</td>
              <td><strong>{formatQty(at.available, unit)}</strong></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
