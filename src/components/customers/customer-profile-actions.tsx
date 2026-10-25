"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { deleteCustomer } from "@/lib/actions/customers";
import { notify } from "@/lib/notify";
import type { Tables } from "@/lib/types/database.types";
import { CustomerDialog } from "./customer-dialog";

type Props = {
  customer: Tables<"customers">;
  /** RF-19.2: the customer's tags, for the edit dialog. */
  tagIds: string[];
  allowInternationalPhones: boolean;
  /** Customers with quotes can't be deleted; the button explains why. */
  hasQuotes: boolean;
};

export function CustomerProfileActions({ customer, tagIds, allowInternationalPhones, hasQuotes }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = async () => {
    setPending(true);
    setError(null);
    const result = await deleteCustomer(customer.id);
    setPending(false);
    if (result.status === "error") {
      setError(result.message);
      notify.error(`${customer.name} not deleted`, result.message);
      return;
    }
    notify.success(`${customer.name} deleted`, "Removed from your customer directory.");
    router.push("/customers");
  };

  return (
    <>
      <button type="button" className="button" onClick={() => setEditing(true)}>
        <Pencil size={14} /> Edit
      </button>
      <button
        type="button"
        className="button"
        onClick={() => setConfirming(true)}
        disabled={hasQuotes}
        title={hasQuotes ? "Customers with quotes or invoices can't be deleted." : undefined}
      >
        <Trash2 size={14} /> Delete
      </button>

      <CustomerDialog
        open={editing}
        onOpenChange={setEditing}
        allowInternationalPhones={allowInternationalPhones}
        customer={customer}
        tagIds={tagIds}
      />

      <Dialog.Root
        open={confirming}
        onOpenChange={(open) => {
          if (!open) setError(null);
          setConfirming(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-backdrop">
            <Dialog.Content className="modal modal-sm" role="alertdialog">
              <div className="modal-header">
                <div>
                  <span className="header-icon danger"><Trash2 size={18} /></span>
                  <div>
                    <Dialog.Title asChild><h2>Delete this customer?</h2></Dialog.Title>
                    <Dialog.Description asChild><p>This can&apos;t be undone.</p></Dialog.Description>
                  </div>
                </div>
              </div>
              <div className="modal-body">
                {error && <div className="form-alert form-alert-error modal-alert" role="alert">{error}</div>}
                <p className="confirm-text">
                  <strong>{customer.name}</strong> and their contact details will be removed from your directory.
                </p>
              </div>
              <div className="modal-footer">
                <Dialog.Close asChild>
                  <button type="button" className="button" disabled={pending}>Cancel</button>
                </Dialog.Close>
                <button type="button" className="button button-danger" onClick={confirmDelete} disabled={pending}>
                  {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {pending ? "Deleting…" : "Delete Customer"}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
