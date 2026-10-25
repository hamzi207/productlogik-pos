"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Archive, ArchiveRestore, Loader2, Pencil, Plus, Ruler, Star, Tag, Trash2, UserCog } from "lucide-react";
import { ConfirmDialog, type ConfirmRequest } from "@/components/quotes/confirm-dialog";
import { SubscriptionDialog as FormDialog, useSubmit } from "@/components/subscription/subscription-dialog";
import { useUnsavedSettings } from "@/components/settings/unsaved-settings";
import {
  deleteCustomerTag,
  deleteCustomerType,
  deleteUnit,
  saveCustomerTag,
  saveCustomerType,
  saveUnit,
  setCustomerTypeArchived,
  setDefaultCustomerType,
  setPacksEnabled,
  setUnitArchived,
  type ListResult,
} from "@/lib/actions/lists";
import { CATEGORY_COLORS, COLOR_KEYS } from "@/lib/category-colors";
import { tagStyle } from "@/components/customers/customer-tags";
import type { CustomerTag, CustomerTypeOption } from "@/lib/customer-lists";
import { notify } from "@/lib/notify";
import type { Unit, UnitPreset } from "@/lib/uom";

// Settings → Units and Settings → Customers (Phase 19), and the console's matching tab (superadmin parity:
// the console passes `tenantId`). `canEdit` false shows the lists read-only (staff members).

type Common = { tenantId?: string; canEdit: boolean };

/** Runs a list action and toasts the outcome. */
function useListAction() {
  const [pending, startTransition] = useTransition();
  const act = (action: () => Promise<ListResult>, done: string, failed = "Not changed", after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.status === "error") notify.error(failed, result.message);
      else notify.success(done, result.message);
      after?.();
    });
  return { pending, act };
}

function CardHead({ icon, title, description, pending, canEdit, addLabel, onAdd }: { icon: ReactNode; title: string; description: string; pending: boolean; canEdit: boolean; addLabel: string; onAdd: () => void }) {
  return (
    <div className="settings-card-head">
      <span className="header-icon blue">{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {pending && <Loader2 size={15} className="animate-spin" />}
      {canEdit && (
        <button type="button" className="button button-primary" onClick={onAdd}>
          <Plus size={14} /> {addLabel}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------------------------------

const DECIMAL_CHOICES = [
  { value: 0, label: "Whole numbers (12)" },
  { value: 1, label: "1 decimal place (1.5)" },
  { value: 2, label: "2 decimal places (2.75)" },
  { value: 3, label: "3 decimal places (1.250)" },
];

type UnitDialogProps = { unit: Unit | null; units: Unit[]; presets: UnitPreset[]; tenantId?: string; packsEnabled: boolean; onClose: () => void };

function UnitDialog({ unit, units, presets, tenantId, packsEnabled, onClose }: UnitDialogProps) {
  const [v, setV] = useState({ code: unit?.code ?? "", name: unit?.name ?? "", decimals: unit?.decimals ?? 0, isPack: unit?.is_pack ?? false });
  const { busy, error, run } = useSubmit(onClose, unit ? "Unit saved" : "Unit added");
  // New units can start from a platform preset the organization doesn't have yet (inch, sqm, cbm…).
  const have = new Set(units.map((u) => u.code.toLowerCase()));
  const picks = unit ? [] : presets.filter((p) => !have.has(p.code));
  const picked = picks.find((p) => p.code === v.code.toLowerCase())?.code ?? "";
  return (
    <FormDialog
      open
      onClose={onClose}
      icon={unit ? Pencil : Ruler}
      title={unit ? `Edit ${unit.name}` : "Add a unit"}
      description="Products count stock in a unit, and can be sold in packs of another (set up in each product)."
      submitLabel="Save"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => saveUnit(v, unit?.id, tenantId))}
    >
      {picks.length > 0 && (
        <label className="span-two">
          <span>COMMON UNIT</span>
          <select
            value={picked}
            onChange={(e) => {
              const p = picks.find((x) => x.code === e.target.value);
              setV(p ? { code: p.code, name: p.name, decimals: p.decimals, isPack: p.is_pack } : { code: "", name: "", decimals: 0, isPack: false });
            }}
          >
            <option value="">Your own unit (fill in below)</option>
            {picks.map((p) => (
              <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
            ))}
          </select>
          <small>Pick one to fill in the code, name and decimals, or type your own below.</small>
        </label>
      )}
      <label>
        <span>CODE</span>
        <input autoFocus value={v.code} maxLength={12} placeholder="e.g. box" onChange={(e) => setV({ ...v, code: e.target.value })} />
        <small>Shown next to quantities: 12 box, 1.5 kg.</small>
      </label>
      <label>
        <span>NAME</span>
        <input value={v.name} maxLength={40} placeholder="e.g. Box" onChange={(e) => setV({ ...v, name: e.target.value })} />
      </label>
      <label className="span-two">
        <span>QUANTITIES</span>
        <select value={v.decimals} onChange={(e) => setV({ ...v, decimals: Number(e.target.value) })}>
          {DECIMAL_CHOICES.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        <small>Weighed and measured units (kg, litre, metre) usually allow decimals. Changing this doesn&apos;t alter stock already recorded.</small>
      </label>
      <label className="span-two check-field">
        <input type="checkbox" checked={v.isPack} onChange={(e) => setV({ ...v, isPack: e.target.checked })} />
        <div>
          <strong>Can be a pack</strong>
          <small>
            Products can be bought and sold in this unit as a pack of their own unit, e.g. 1 box = 12 pcs.
            {!packsEnabled && " Packs are switched off at the moment (top of this page)."}
          </small>
        </div>
      </label>
    </FormDialog>
  );
}

type UnitProps = Common & {
  units: Unit[];
  /** Platform presets for Add unit (uom_presets). */
  presets: UnitPreset[];
  /** tenants.packs_enabled */
  packsEnabled: boolean;
  /** Products that have packs set up (kept when packs are switched off). */
  packProducts: number;
};

export function UnitManager({ units, presets, tenantId, canEdit, packsEnabled, packProducts }: UnitProps) {
  const [dialog, setDialog] = useState<{ unit: Unit | null } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const { pending, act } = useListAction();
  const packUnits = units.filter((u) => u.is_pack && !u.is_archived);

  // The packs switch is a setting: flipping it only drafts the change, saved or discarded from the
  // page's Save Settings bar (unsaved-settings.tsx). null = as saved.
  const [packsDraft, setPacksDraft] = useState<boolean | null>(null);
  const packsOn = packsDraft ?? packsEnabled;
  const packsDirty = packsDraft !== null && packsDraft !== packsEnabled;
  useUnsavedSettings(
    "units-packs",
    "Sell and buy in packs",
    packsDirty,
    async () => {
      const result = await setPacksEnabled(packsOn, tenantId);
      if (result.status === "error") {
        notify.error("Settings not saved", result.message);
        return false;
      }
      setPacksDraft(null);
      notify.success(packsOn ? "Packs switched on" : "Packs switched off", result.message);
      return true;
    },
    () => setPacksDraft(null),
  );

  const remove = (u: Unit) =>
    setConfirm({
      title: `Delete ${u.name}?`,
      body: <p>Only possible while no product uses it. Documents keep showing {u.code}. Archive it instead to hide it from new products.</p>,
      confirmLabel: "Delete",
      icon: <Trash2 size={18} />,
      tone: "danger",
      onConfirm: () => act(() => deleteUnit(u.id, tenantId), "Unit deleted", "Not deleted", () => setConfirm(null)),
    });

  return (
    <section className="card settings-card">
      <CardHead
        icon={<Ruler size={18} />}
        title="Units of measure"
        description="The units products are counted and sold in. They start from the industry's list; add your own any time."
        pending={pending}
        canEdit={canEdit}
        addLabel="Unit"
        onAdd={() => setDialog({ unit: null })}
      />
      <label className="settings-row packs-switch">
        <span className="settings-label">
          Sell and buy in packs
          <small>
            {packsOn
              ? `Products can also be sold (and later bought) by the box, carton or another pack of their own unit, each with its own price and barcode. Packs: ${packUnits.map((u) => u.code).join(", ") || "none yet, mark a unit below"}.`
              : "Off: every product is counted, bought and sold in one unit. Switch on to sell by the box, carton, dozen and so on (Box, Carton, Pack and Dozen are added if missing)."}
          </small>
        </span>
        <input type="checkbox" className="switch" checked={packsOn} disabled={!canEdit} onChange={(e) => setPacksDraft(e.target.checked)} />
      </label>
      {packsDirty && !packsOn && packProducts > 0 && (
        <div className="form-alert form-alert-warning" role="status">
          {packProducts} {packProducts === 1 ? "product has" : "products have"} packs set up. They&apos;re kept and come back when you
          switch packs on again. Meanwhile new document lines use each product&apos;s own unit, and documents already saved keep their packs.
        </div>
      )}
      {units.length === 0 ? (
        <div className="empty-state"><strong>No units yet</strong></div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>UNIT</th>
                <th>CODE</th>
                <th>QUANTITIES</th>
                <th>PACK</th>
                {canEdit && <th><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} className={u.is_archived ? "is-retired" : undefined}>
                  <td className="primary-cell">
                    <strong>
                      {u.name}
                      {u.is_archived && <span className="badge">Archived</span>}
                    </strong>
                  </td>
                  <td><code>{u.code}</code></td>
                  <td>{u.decimals === 0 ? "Whole numbers" : `Up to ${u.decimals} decimal place${u.decimals === 1 ? "" : "s"}`}</td>
                  <td>{u.is_pack ? <span className={`badge${packsEnabled ? " badge-blue" : ""}`}>Pack</span> : <span className="admin-muted">—</span>}</td>
                  {canEdit && (
                    <td>
                      <div className="row-actions admin-row-actions">
                        <button type="button" className="icon-button" aria-label={`Edit ${u.name}`} title="Edit" onClick={() => setDialog({ unit: u })}>
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`${u.is_archived ? "Restore" : "Archive"} ${u.name}`}
                          title={u.is_archived ? "Restore" : "Archive (products using it keep it)"}
                          disabled={pending}
                          onClick={() => act(() => setUnitArchived(u.id, !u.is_archived, tenantId), u.is_archived ? "Unit restored" : "Unit archived")}
                        >
                          {u.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                        </button>
                        <button type="button" className="icon-button danger" aria-label={`Delete ${u.name}`} title="Delete (only if no product uses it)" disabled={pending} onClick={() => remove(u)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog && <UnitDialog unit={dialog.unit} units={units} presets={presets} tenantId={tenantId} packsEnabled={packsEnabled} onClose={() => setDialog(null)} />}
      <ConfirmDialog request={confirm} pending={pending} onOpenChange={(open) => !open && setConfirm(null)} />
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------
// Customer types
// ---------------------------------------------------------------------------------------------------

function TypeDialog({ type, tenantId, onClose }: { type: CustomerTypeOption | null; tenantId?: string; onClose: () => void }) {
  const [v, setV] = useState({ name: type?.name ?? "", requiresTaxDetails: type?.requires_tax_details ?? false });
  const { busy, error, run } = useSubmit(onClose, type ? "Customer type saved" : "Customer type added");
  return (
    <FormDialog
      open
      onClose={onClose}
      icon={type ? Pencil : UserCog}
      title={type ? `Edit ${type.name}` : "Add a customer type"}
      description={type ? "Renaming changes it on every customer of this type." : "Customers get one type each; it shows on the directory and filters it."}
      submitLabel="Save"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => saveCustomerType(v, type?.id, tenantId))}
    >
      <label className="span-two">
        <span>NAME</span>
        <input autoFocus value={v.name} maxLength={40} placeholder="e.g. Wholesale" onChange={(e) => setV({ ...v, name: e.target.value })} />
      </label>
      <label className="span-two check-field">
        <input type="checkbox" checked={v.requiresTaxDetails} onChange={(e) => setV({ ...v, requiresTaxDetails: e.target.checked })} />
        <div>
          <strong>Needs tax details</strong>
          <small>Customers of this type must have a CNIC or NTN (for tax invoices). They count as business accounts.</small>
        </div>
      </label>
    </FormDialog>
  );
}

export function CustomerTypeManager({ types, tenantId, canEdit }: Common & { types: CustomerTypeOption[] }) {
  const [dialog, setDialog] = useState<{ type: CustomerTypeOption | null } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const { pending, act } = useListAction();

  const remove = (t: CustomerTypeOption) =>
    setConfirm({
      title: `Delete ${t.name}?`,
      body: <p>Only possible while no customer has this type. Archive it instead to stop using it for new customers.</p>,
      confirmLabel: "Delete",
      icon: <Trash2 size={18} />,
      tone: "danger",
      onConfirm: () => act(() => deleteCustomerType(t.id, tenantId), "Customer type deleted", "Not deleted", () => setConfirm(null)),
    });

  return (
    <section className="card settings-card">
      <CardHead
        icon={<UserCog size={18} />}
        title="Customer types"
        description="Every customer has one type. The default is used for the walk-in customer and new customers."
        pending={pending}
        canEdit={canEdit}
        addLabel="Type"
        onAdd={() => setDialog({ type: null })}
      />
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>TYPE</th>
              <th>TAX DETAILS</th>
              {canEdit && <th><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id} className={t.is_archived ? "is-retired" : undefined}>
                <td className="primary-cell">
                  <strong>
                    {t.name}
                    {t.is_default && <span className="badge badge-blue">Default</span>}
                    {t.is_archived && <span className="badge">Archived</span>}
                  </strong>
                </td>
                <td>{t.requires_tax_details ? "CNIC / NTN required" : "Optional"}</td>
                {canEdit && (
                  <td>
                    <div className="row-actions admin-row-actions">
                      <button type="button" className="icon-button" aria-label={`Edit ${t.name}`} title="Edit" onClick={() => setDialog({ type: t })}>
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Make ${t.name} the default`}
                        title={t.is_default ? "Default type" : t.is_archived ? "Restore it first" : "Make default"}
                        disabled={pending || t.is_default || t.is_archived}
                        onClick={() => act(() => setDefaultCustomerType(t.id, tenantId), "Default type changed")}
                      >
                        <Star size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`${t.is_archived ? "Restore" : "Archive"} ${t.name}`}
                        title={t.is_default ? "The default type can't be archived" : t.is_archived ? "Restore" : "Archive (customers keep it)"}
                        disabled={pending || t.is_default}
                        onClick={() => act(() => setCustomerTypeArchived(t.id, !t.is_archived, tenantId), t.is_archived ? "Customer type restored" : "Customer type archived")}
                      >
                        {t.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      </button>
                      <button type="button" className="icon-button danger" aria-label={`Delete ${t.name}`} title={t.is_default ? "The default type can't be deleted" : "Delete (only if no customer has it)"} disabled={pending || t.is_default} onClick={() => remove(t)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialog && <TypeDialog type={dialog.type} tenantId={tenantId} onClose={() => setDialog(null)} />}
      <ConfirmDialog request={confirm} pending={pending} onOpenChange={(open) => !open && setConfirm(null)} />
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------
// Customer tags (RF-19.2)
// ---------------------------------------------------------------------------------------------------

function TagDialog({ tag, tenantId, onClose }: { tag: CustomerTag | null; tenantId?: string; onClose: () => void }) {
  const [v, setV] = useState({ name: tag?.name ?? "", color: tag?.color ?? "" });
  const { busy, error, run } = useSubmit(onClose, tag ? "Tag saved" : "Tag added");
  return (
    <FormDialog
      open
      onClose={onClose}
      icon={tag ? Pencil : Tag}
      title={tag ? `Edit ${tag.name}` : "Add a tag"}
      description="Group customers any way you like (e.g. Lahore dealers, Monthly billing). Staff add tags in the customer dialog."
      submitLabel="Save"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => saveCustomerTag({ name: v.name, color: v.color || null }, tag?.id, tenantId))}
    >
      <label className="span-two">
        <span>NAME</span>
        <input autoFocus value={v.name} maxLength={30} placeholder="e.g. Monthly billing" onChange={(e) => setV({ ...v, name: e.target.value })} />
      </label>
      <div className="span-two">
        <span className="field-label">COLOUR</span>
        <div className="swatch-picker" role="radiogroup" aria-label="Colour">
          <button type="button" role="radio" aria-checked={v.color === ""} className={`swatch swatch-none${v.color === "" ? " is-on" : ""}`} title="None" aria-label="No colour" onClick={() => setV({ ...v, color: "" })} />
          {COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={v.color === key}
              className={`swatch${v.color === key ? " is-on" : ""}`}
              style={{ background: CATEGORY_COLORS[key] }}
              title={key}
              aria-label={key}
              onClick={() => setV({ ...v, color: key })}
            />
          ))}
        </div>
      </div>
    </FormDialog>
  );
}

export function CustomerTagManager({ tags, counts, tenantId, canEdit }: Common & { tags: CustomerTag[]; counts: Record<string, number> }) {
  const [dialog, setDialog] = useState<{ tag: CustomerTag | null } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const { pending, act } = useListAction();

  const remove = (t: CustomerTag) =>
    setConfirm({
      title: `Delete ${t.name}?`,
      body: <p>It comes off {counts[t.id] ? `the ${counts[t.id]} customer${counts[t.id] === 1 ? "" : "s"} that have it` : "every customer"}; the customers stay. This can&apos;t be undone.</p>,
      confirmLabel: "Delete",
      icon: <Trash2 size={18} />,
      tone: "danger",
      onConfirm: () => act(() => deleteCustomerTag(t.id, tenantId), "Tag deleted", "Not deleted", () => setConfirm(null)),
    });

  return (
    <section className="card settings-card">
      <CardHead
        icon={<Tag size={18} />}
        title="Customer tags"
        description="Coloured labels for grouping customers. They filter the customer list and reports."
        pending={pending}
        canEdit={canEdit}
        addLabel="Tag"
        onAdd={() => setDialog({ tag: null })}
      />
      {tags.length === 0 ? (
        <div className="empty-state"><strong>No tags yet</strong>{canEdit ? "Add one to start grouping customers." : "Organization admins can add them."}</div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>TAG</th>
                <th className="numeric">CUSTOMERS</th>
                {canEdit && <th><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.id}>
                  <td className="primary-cell">
                    <span className="tag-chip" style={tagStyle(t.color)}>{t.name}</span>
                  </td>
                  <td className="numeric">{counts[t.id] ?? 0}</td>
                  {canEdit && (
                    <td>
                      <div className="row-actions admin-row-actions">
                        <button type="button" className="icon-button" aria-label={`Edit ${t.name}`} title="Edit" onClick={() => setDialog({ tag: t })}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="icon-button danger" aria-label={`Delete ${t.name}`} title="Delete" disabled={pending} onClick={() => remove(t)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog && <TagDialog tag={dialog.tag} tenantId={tenantId} onClose={() => setDialog(null)} />}
      <ConfirmDialog request={confirm} pending={pending} onOpenChange={(open) => !open && setConfirm(null)} />
    </section>
  );
}
