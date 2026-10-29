"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { Loader2, Trash2 } from "lucide-react";
import { deleteInventoryItem } from "@/lib/actions/inventory";
import { deleteProductGroup } from "@/lib/actions/product-groups";
import { notify } from "@/lib/notify";
import type { InventoryEntry } from "@/lib/types/inventory";

type Props = {
  /** A product or kit, or (Phase 21) a product group with all its variants. */
  entry: InventoryEntry | null;
  onOpenChange: (open: boolean) => void;
};

export function DeleteItemDialog({ entry, onOpenChange }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const group = entry?.kind === "group" ? entry.group : null;
  const item = entry?.kind === "item" ? entry.item : null;
  const name = group?.name ?? item?.name ?? "";

  const confirm = async () => {
    if (!entry) return;
    setPending(true);
    setError(null);
    if (group) {
      const result = await deleteProductGroup(group.id);
      setPending(false);
      if (result.status === "error") {
        setError(result.message);
        notify.error(`${name} not deleted`, result.message);
        return;
      }
      notify.success(
        `${name} deleted`,
        result.outcome === "archived"
          ? "Variants on documents were archived so those documents still print; the rest were removed."
          : `${group.variants.length} variant${group.variants.length === 1 ? "" : "s"} removed from inventory.`,
      );
      onOpenChange(false);
      return;
    }
    if (!item) return;
    const result = await deleteInventoryItem(item.id);
    setPending(false);
    if (result.status === "error") {
      setError(result.message);
      notify.error(`${name} not deleted`, result.message);
      return;
    }
    notify.success(`${name} deleted`, `${item.sku} removed from inventory. Existing documents keep their lines and prices.`);
    onOpenChange(false);
  };

  return (
    <Dialog.Root
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) setError(null);
        onOpenChange(open);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content className="modal modal-sm" role="alertdialog">
            <div className="modal-header">
              <div>
                <span className="header-icon danger"><Trash2 size={18} /></span>
                <div>
                  <Dialog.Title asChild><h2>{group ? "Delete this product and its variants?" : item?.is_kit ? "Delete this kit?" : "Delete this product?"}</h2></Dialog.Title>
                  <Dialog.Description asChild>
                    <p>This can&apos;t be undone.</p>
                  </Dialog.Description>
                </div>
              </div>
            </div>
            <div className="modal-body">
              {error && <div className="form-alert form-alert-error modal-alert" role="alert">{error}</div>}
              {group ? (
                <p className="confirm-text">
                  <strong>{group.name}</strong> and its {group.variants.length} variant{group.variants.length === 1 ? "" : "s"} will be removed. Variants
                  must have no stock first. Existing documents keep their line descriptions and prices.
                </p>
              ) : (
                <p className="confirm-text">
                  <strong>{item?.name}</strong> <span className="mono">({item?.sku})</span>
                  {item?.vehicles.length ? " and its vehicle fitment links" : ""}
                  {item?.is_kit ? " will be removed (its products stay in inventory)" : " will be removed"}. Existing documents keep their line
                  descriptions and prices.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <Dialog.Close asChild>
                <button type="button" className="button" disabled={pending}>Cancel</button>
              </Dialog.Close>
              <button type="button" className="button button-danger" onClick={confirm} disabled={pending}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {pending ? "Deleting…" : group ? "Delete Product & Variants" : item?.is_kit ? "Delete Kit" : "Delete Product"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
