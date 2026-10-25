"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight, Hash, Loader2, Pencil, Plus, Save, Store as StoreIcon, Trash2, Users } from "lucide-react";
import { ConfirmDialog, type ConfirmRequest } from "@/components/quotes/confirm-dialog";
import { useUnsavedSettings } from "@/components/settings/unsaved-settings";
import { SubscriptionDialog as FormDialog, useSubmit } from "@/components/subscription/subscription-dialog";
import { deleteStore, saveStore, saveStoreSettings, setMemberStores, type StoreResult } from "@/lib/actions/stores";
import { notify } from "@/lib/notify";
import type { StoreMember, StoreRow, StoresSettings } from "@/lib/store-data";

// Settings → Stores (Phase 20) and the console's matching tab (superadmin parity: the console passes
// `tenantId`). `canEdit` false shows everything read-only (staff members). Organization admins add
// stores up to the subscription's limit and edit them; deleting and switching stores off or on is
// console-only.

type Common = { tenantId?: string; canEdit: boolean };

function useStoreAction() {
  const [pending, startTransition] = useTransition();
  const act = (action: () => Promise<StoreResult>, done: string, failed = "Not changed", after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.status === "error") notify.error(failed, result.message);
      else notify.success(done, result.message);
      after?.();
    });
  return { pending, act };
}

// ---------------------------------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------------------------------

function StoreDialog({ store, tenantId, numberPerStore, onClose }: { store: StoreRow | null; tenantId?: string; numberPerStore: boolean; onClose: () => void }) {
  const [v, setV] = useState({
    name: store?.name ?? "",
    code: store?.code ?? "",
    address: store?.address ?? "",
    phone: store?.phone ?? "",
    ntn: store?.ntn ?? "",
    strn: store?.strn ?? "",
    isActive: store?.is_active ?? true,
  });
  const { busy, error, run } = useSubmit(onClose, store ? "Store saved" : "Store added");
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <FormDialog
      open
      onClose={onClose}
      icon={store ? Pencil : StoreIcon}
      title={store ? `Edit ${store.name}` : "Add a store"}
      description="Documents created in a store use its stock. Its address, phone and tax numbers replace the business profile's on its documents."
      submitLabel="Save"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => saveStore(v, store?.id, tenantId))}
    >
      <label>
        <span>NAME</span>
        <input autoFocus value={v.name} maxLength={60} placeholder="e.g. Liberty Market" onChange={set("name")} />
      </label>
      <label>
        <span>CODE{numberPerStore ? "" : " (OPTIONAL)"}</span>
        <input value={v.code} maxLength={8} placeholder="e.g. LHR1" onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />
        <small>{numberPerStore ? "Starts this store's document numbers: LHR1-INV-1001." : "Short name; starts document numbers if you number per store."}</small>
      </label>
      <label className="span-two">
        <span>ADDRESS (OPTIONAL)</span>
        <textarea rows={2} value={v.address} maxLength={300} placeholder="Leave empty to use the business address" onChange={set("address")} />
      </label>
      <label>
        <span>PHONE (OPTIONAL)</span>
        <input value={v.phone} maxLength={30} placeholder="Business phone" onChange={set("phone")} />
      </label>
      <label>
        <span>NTN (OPTIONAL)</span>
        <input value={v.ntn} maxLength={9} placeholder="1234567-8" onChange={set("ntn")} />
      </label>
      <label>
        <span>STRN (OPTIONAL)</span>
        <input value={v.strn} maxLength={13} inputMode="numeric" placeholder="13 digits" onChange={set("strn")} />
      </label>
      {tenantId && store && !store.is_main && (
        <label className="check-field">
          <input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} />
          <div>
            <strong>Open</strong>
            <small>A switched-off store keeps its stock and documents, but nobody can create documents there.</small>
          </div>
        </label>
      )}
    </FormDialog>
  );
}

function StoresCard({ stores, tenantId, canEdit, numberPerStore, limit }: Common & { stores: StoreRow[]; numberPerStore: boolean; limit: number | null }) {
  const [dialog, setDialog] = useState<{ store: StoreRow | null } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const { pending, act } = useStoreAction();
  const open = stores.filter((s) => s.is_active).length;
  const full = limit !== null && open >= limit;
  const included = limit === null ? null : `${limit} ${limit === 1 ? "store" : "stores"}`;
  const remove = (s: StoreRow) =>
    setConfirm({
      title: `Delete ${s.name}?`,
      body: <p>Only possible while it never had stock, documents or stock history. Switch it off instead to keep its records.</p>,
      confirmLabel: "Delete",
      icon: <Trash2 size={18} />,
      tone: "danger",
      onConfirm: () => act(() => deleteStore(s.id, tenantId), "Store deleted", "Not deleted", () => setConfirm(null)),
    });
  return (
    <section className="card settings-card">
      <div className="settings-card-head team-head">
        <span className="header-icon blue"><StoreIcon size={18} /></span>
        <div>
          <h2>Stores</h2>
          <p>
            Each store has its own stock. Everyone sees every store&apos;s stock; documents use the stock of the store they&apos;re made in.
            {included && ` The subscription includes ${included}: ${open} open.`}
          </p>
        </div>
        {pending && <Loader2 size={15} className="animate-spin" />}
        {canEdit && (tenantId || !full) && (
          <button type="button" className="button button-primary" disabled={Boolean(tenantId) && full} onClick={() => setDialog({ store: null })}>
            <Plus size={14} /> Store
          </button>
        )}
      </div>
      {canEdit && full && (
        <div className="form-alert form-alert-info settings-card-alert" role="status">
          {tenantId
            ? `The subscription includes ${included} and all are open. Raise its store limit on the Subscription tab to add another.`
            : `Your subscription includes ${included}. To add another, ask ProductLogik to update it (Subscription → Request a Plan Change).`}
        </div>
      )}
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>STORE</th>
              <th>CODE</th>
              <th>CONTACT ON DOCUMENTS</th>
              <th>OWN PRICES</th>
              {canEdit && <th><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} className={s.is_active ? undefined : "is-retired"}>
                <td className="primary-cell">
                  <strong>
                    {s.name}
                    {s.is_main && <span className="badge badge-blue">Main</span>}
                    {!s.is_active && <span className="badge">Switched off</span>}
                  </strong>
                </td>
                <td>{s.code ? <code>{s.code}</code> : <span className="admin-muted">—</span>}</td>
                <td>{s.address || s.phone ? [s.address, s.phone].filter(Boolean).join(" · ") : <span className="admin-muted">Business profile</span>}</td>
                <td>{s.priced ? `${s.priced} product${s.priced === 1 ? "" : "s"}` : <span className="admin-muted">—</span>}</td>
                {canEdit && (
                  <td>
                    <div className="row-actions admin-row-actions">
                      <button type="button" className="icon-button" aria-label={`Edit ${s.name}`} title="Edit" onClick={() => setDialog({ store: s })}>
                        <Pencil size={14} />
                      </button>
                      {tenantId && !s.is_main && (
                        <button type="button" className="icon-button danger" aria-label={`Delete ${s.name}`} title="Delete (only a store without history)" disabled={pending} onClick={() => remove(s)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialog && <StoreDialog store={dialog.store} tenantId={tenantId} numberPerStore={numberPerStore} onClose={() => setDialog(null)} />}
      <ConfirmDialog request={confirm} pending={pending} onOpenChange={(open) => !open && setConfirm(null)} />
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------
// Selling from other stores, per-store numbering (saved from the page's Save Settings bar)
// ---------------------------------------------------------------------------------------------------

function StoreSettingsCard({ settings, stores, tenantId, canEdit }: Common & { settings: StoresSettings["settings"]; stores: StoreRow[] }) {
  const [draft, setDraft] = useState<StoresSettings["settings"] | null>(null);
  const v = draft ?? settings;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(settings);
  const missingCodes = stores.filter((s) => s.is_active && !s.code).map((s) => s.name);
  const change = (patch: Partial<StoresSettings["settings"]>) => setDraft({ ...v, ...patch });
  useUnsavedSettings(
    "store-settings",
    "Stores",
    dirty,
    async () => {
      const result = await saveStoreSettings(v, tenantId);
      if (result.status === "error") {
        notify.error("Settings not saved", result.message);
        return false;
      }
      setDraft(null);
      notify.success("Settings saved", "Store rules updated.");
      return true;
    },
    () => setDraft(null),
  );
  return (
    <section className="card settings-card">
      <div className="settings-card-head">
        <span className="header-icon blue"><ArrowLeftRight size={18} /></span>
        <div>
          <h2>Selling across stores</h2>
          <p>By default a store sells only its own stock. Other stores&apos; stock is still shown everywhere.</p>
        </div>
      </div>
      <label className="settings-row">
        <span className="settings-label">
          Allow invoicing from other stores&apos; stock
          <small>A document line can then take its stock from another store (&quot;From: Store B&quot;). The document stays with its own store.</small>
        </span>
        <input type="checkbox" className="switch" checked={v.allowCrossStore} disabled={!canEdit} onChange={(e) => change({ allowCrossStore: e.target.checked })} />
      </label>
      {v.allowCrossStore && (
        <label className="settings-row">
          <span className="settings-label">
            Who can do it
            <small>Managers arrive with roles (a later update); until then &quot;Managers and admins&quot; means admins.</small>
          </span>
          <select className="filter-select store-roles-select" value={v.crossStoreRoles} disabled={!canEdit} onChange={(e) => change({ crossStoreRoles: e.target.value === "all" ? "all" : "managers" })}>
            <option value="managers">Managers and admins</option>
            <option value="all">Everyone who can invoice</option>
          </select>
        </label>
      )}
      <div className="settings-card-head settings-subhead">
        <span className="header-icon blue"><Hash size={18} /></span>
        <div>
          <h2>Document numbers</h2>
          <p>One series for the whole organization, or one per store.</p>
        </div>
      </div>
      <label className="settings-row">
        <span className="settings-label">
          Number documents per store
          <small>
            Each store counts its own drafts, quotations and invoices, starting with its code: LHR1-INV-1001. Numbers already given never change.
            {missingCodes.length > 0 && ` Give ${missingCodes.join(", ")} a code first.`}
          </small>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={v.numberPerStore}
          disabled={!canEdit || (!v.numberPerStore && missingCodes.length > 0)}
          onChange={(e) => change({ numberPerStore: e.target.checked })}
        />
      </label>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------
// Who works where
// ---------------------------------------------------------------------------------------------------

function MemberRow({ member, stores, tenantId, canEdit }: Common & { member: StoreMember; stores: StoreRow[] }) {
  const active = stores.filter((s) => s.is_active);
  const [ids, setIds] = useState(member.storeIds);
  const [def, setDef] = useState(member.defaultStoreId ?? ids[0] ?? active[0]?.id ?? "");
  const { pending, act } = useStoreAction();
  const dirty = JSON.stringify([...ids].sort()) !== JSON.stringify([...member.storeIds].sort()) || def !== (member.defaultStoreId ?? "");
  const toggle = (id: string, on: boolean) => {
    const next = on ? [...ids, id] : ids.filter((x) => x !== id);
    setIds(next);
    if (!next.includes(def)) setDef(next[0] ?? "");
  };
  if (member.role === "admin") {
    return (
      <tr>
        <td className="primary-cell"><strong>{member.fullName}</strong><span>{member.email}</span></td>
        <td colSpan={2}><span className="admin-muted">Admin: works in every store</span></td>
        {canEdit && <td />}
      </tr>
    );
  }
  return (
    <tr>
      <td className="primary-cell"><strong>{member.fullName}</strong><span>{member.email}</span></td>
      <td>
        <div className="store-checks">
          {active.map((s) => (
            <label key={s.id} className="check-chip">
              <input type="checkbox" checked={ids.includes(s.id)} disabled={!canEdit || pending} onChange={(e) => toggle(s.id, e.target.checked)} />
              {s.name}
            </label>
          ))}
        </div>
      </td>
      <td>
        <select className="admin-role-select" value={def} disabled={!canEdit || pending || ids.length < 2} onChange={(e) => setDef(e.target.value)} aria-label={`${member.fullName}'s default store`}>
          {active.filter((s) => ids.includes(s.id)).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </td>
      {canEdit && (
        <td>
          <button
            type="button"
            className="button"
            disabled={!dirty || pending || !ids.length}
            onClick={() => act(() => setMemberStores(member.id, ids, def, tenantId), "Stores saved")}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
          </button>
        </td>
      )}
    </tr>
  );
}

function AccessCard({ members, stores, tenantId, canEdit }: Common & { members: StoreMember[]; stores: StoreRow[] }) {
  return (
    <section className="card settings-card">
      <div className="settings-card-head">
        <span className="header-icon blue"><Users size={18} /></span>
        <div>
          <h2>Who works where</h2>
          <p>Staff create documents only in their stores and start in their default store. Viewing stock is never limited.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>MEMBER</th>
              <th>WORKS IN</th>
              <th>STARTS IN</th>
              {canEdit && <th><span className="sr-only">Save</span></th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <MemberRow key={`${m.id}:${m.storeIds.join(",")}:${m.defaultStoreId}`} member={m} stores={stores} tenantId={tenantId} canEdit={canEdit} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Settings → Stores: the stores, selling across them, numbering and who works where. */
export function StoreManager({ data, tenantId, canEdit }: Common & { data: StoresSettings }) {
  const multi = data.stores.filter((s) => s.is_active).length > 1;
  return (
    <div className="settings-form">
      {!canEdit && (
        <div className="form-alert form-alert-info" role="status">
          Only organization admins can change stores.
        </div>
      )}
      <StoresCard stores={data.stores} tenantId={tenantId} canEdit={canEdit} numberPerStore={data.settings.numberPerStore} limit={data.storeLimit} />
      <StoreSettingsCard settings={data.settings} stores={data.stores} tenantId={tenantId} canEdit={canEdit} />
      {multi && <AccessCard members={data.members} stores={data.stores} tenantId={tenantId} canEdit={canEdit} />}
    </div>
  );
}
