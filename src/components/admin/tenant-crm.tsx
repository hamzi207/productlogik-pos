"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { CalendarClock, Check, Loader2, MessageSquareText, Pencil, Plus, RotateCcw, Tags, Trash2, X } from "lucide-react";
import { ReasonDialog } from "@/components/admin/subscription-dialogs";
import { DateInput } from "@/components/shared/date-input";
import {
  addFollowUp,
  addTenantNote,
  createAdminTag,
  deleteTenantNote,
  editTenantNote,
  setFollowUpDone,
  setTenantTags,
} from "@/lib/actions/admin-console";
import type { AdminActionResult } from "@/lib/actions/admin";
import { notify } from "@/lib/notify";
import { billingDate, billingToday } from "@/lib/subscription";
import type { TenantOverview } from "@/lib/tenant-overview-data";
import { adminDateTime } from "./format";

// RF-17.2: the superadmin's own notes, tags and follow-ups for an organization. Never shown to it.

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<AdminActionResult>, failTitle: string, then?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      if (result.status === "error") notify.error(failTitle, result.message);
      else then?.();
    });
  return { pending, run };
}

const TAG_COLOURS = ["#64748b", "#7c3aed", "#0284c7", "#059669", "#d97706", "#dc2626", "#db2777"];

export function TenantTagsCard({ tenantId, tags, tagIds }: { tenantId: string; tags: TenantOverview["tags"]; tagIds: string[] }) {
  const { pending, run } = useRun();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLOURS[0]!);
  const on = new Set(tagIds);

  const toggle = (id: string) => {
    const next = on.has(id) ? tagIds.filter((t) => t !== id) : [...tagIds, id];
    run(() => setTenantTags(tenantId, next), "Tags not saved");
  };
  const create = () =>
    run(
      async () => {
        const result = await createAdminTag(name, color);
        if (result.status === "success" && result.id) return setTenantTags(tenantId, [...tagIds, result.id]);
        return result;
      },
      "Tag not added",
      () => {
        setName("");
        setAdding(false);
      },
    );

  return (
    <section className="card admin-section">
      <div className="card-header">
        <div>
          <h2><Tags size={16} /> Tags</h2>
          <p>Click a tag to add or remove it. Tags are shared across all organizations.</p>
        </div>
        {pending && <Loader2 size={15} className="animate-spin" />}
      </div>
      <div className="crm-body">
        <div className="tag-picker">
          {tags.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`tag-chip tag-toggle${on.has(g.id) ? " is-on" : ""}`}
              style={{ "--tag": g.color } as CSSProperties}
              aria-pressed={on.has(g.id)}
              disabled={pending}
              onClick={() => toggle(g.id)}
            >
              {on.has(g.id) && <Check size={11} />} {g.name}
            </button>
          ))}
          {!adding && (
            <button type="button" className="tag-chip tag-new" onClick={() => setAdding(true)}>
              <Plus size={11} /> New tag
            </button>
          )}
        </div>
        {adding && (
          <form
            className="crm-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <input value={name} maxLength={30} placeholder="Tag name" aria-label="Tag name" autoFocus onChange={(e) => setName(e.target.value)} />
            <span className="tag-colours" role="radiogroup" aria-label="Colour">
              {TAG_COLOURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={c === color}
                  aria-label={c}
                  className={c === color ? "is-on" : undefined}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </span>
            <button type="submit" className="button button-primary" disabled={pending || !name.trim()}>Add</button>
            <button type="button" className="icon-button" aria-label="Cancel" onClick={() => setAdding(false)}><X size={14} /></button>
          </form>
        )}
      </div>
    </section>
  );
}

export function TenantFollowUps({ tenantId, followUps }: { tenantId: string; followUps: TenantOverview["followUps"] }) {
  const { pending, run } = useRun();
  const [dueOn, setDueOn] = useState("");
  const [reason, setReason] = useState("");
  const today = billingToday();
  const open = followUps.filter((f) => !f.doneAt);
  const done = followUps.filter((f) => f.doneAt).slice(0, 5);

  return (
    <section className="card admin-section">
      <div className="card-header">
        <div>
          <h2><CalendarClock size={16} /> Follow-ups</h2>
          <p>{open.length ? `${open.length} open` : "Nothing to follow up"}. Overdue ones show on the overview.</p>
        </div>
      </div>
      <div className="crm-body">
        <form
          className="crm-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addFollowUp(tenantId, dueOn, reason), "Follow-up not added", () => {
              setDueOn("");
              setReason("");
            });
          }}
        >
          <DateInput value={dueOn} min={today} aria-label="Follow up on" placeholder="Follow up on" onChange={(e) => setDueOn(e.target.value)} />
          <input value={reason} maxLength={300} placeholder="What to follow up on" aria-label="What to follow up on" onChange={(e) => setReason(e.target.value)} />
          <button type="submit" className="button" disabled={pending || !dueOn || !reason.trim()}><Plus size={14} /> Add</button>
        </form>
        <ul className="crm-list">
          {open.map((f) => (
            <li key={f.id} className={f.dueOn < today ? "is-overdue" : undefined}>
              <button type="button" className="icon-button" aria-label="Mark done" disabled={pending} onClick={() => run(() => setFollowUpDone(f.id, true), "Not updated")}>
                <Check size={14} />
              </button>
              <span>
                <strong>{billingDate(f.dueOn)}{f.dueOn < today ? " · overdue" : f.dueOn === today ? " · today" : ""}</strong>
                <span>{f.reason}</span>
                <small>Added by {f.by}</small>
              </span>
            </li>
          ))}
          {done.map((f) => (
            <li key={f.id} className="is-done">
              <button type="button" className="icon-button" aria-label="Reopen" disabled={pending} onClick={() => run(() => setFollowUpDone(f.id, false), "Not updated")}>
                <RotateCcw size={14} />
              </button>
              <span>
                <strong>{billingDate(f.dueOn)}</strong>
                <span>{f.reason}</span>
                <small>Done by {f.doneBy}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function TenantNotes({ tenantId, notes, meId }: { tenantId: string; notes: TenantOverview["notes"]; meId: string }) {
  const { pending, run } = useRun();
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  return (
    <section className="card admin-section">
      <div className="card-header">
        <div>
          <h2><MessageSquareText size={16} /> Notes</h2>
          <p>Private to superadmins: calls, agreements, anything worth remembering.</p>
        </div>
      </div>
      <div className="crm-body">
        <form
          className="crm-note-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addTenantNote(tenantId, body), "Note not saved", () => setBody(""));
          }}
        >
          <textarea value={body} rows={3} maxLength={4000} placeholder="Add a note…" aria-label="New note" onChange={(e) => setBody(e.target.value)} />
          <button type="submit" className="button button-primary" disabled={pending || !body.trim()}>Add Note</button>
        </form>
        <ul className="crm-notes">
          {notes.map((n) => (
            <li key={n.id}>
              <div className="crm-note-head">
                <strong>{n.author}</strong>
                <small>{adminDateTime(n.createdAt)}{n.editedAt ? " · edited" : ""}</small>
                {n.authorId === meId && editing?.id !== n.id && (
                  <button type="button" className="icon-button" aria-label="Edit note" onClick={() => setEditing({ id: n.id, body: n.body })}>
                    <Pencil size={13} />
                  </button>
                )}
                <button type="button" className="icon-button" aria-label="Delete note" onClick={() => setDeleting(n.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
              {editing?.id === n.id ? (
                <form
                  className="crm-note-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => editTenantNote(n.id, editing.body), "Note not saved", () => setEditing(null));
                  }}
                >
                  <textarea value={editing.body} rows={3} maxLength={4000} aria-label="Edit note" onChange={(e) => setEditing({ id: n.id, body: e.target.value })} />
                  <span className="crm-note-actions">
                    <button type="button" className="button" onClick={() => setEditing(null)}>Cancel</button>
                    <button type="submit" className="button button-primary" disabled={pending || !editing.body.trim()}>Save</button>
                  </span>
                </form>
              ) : (
                <p>{n.body}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
      {deleting && (
        <ReasonDialog
          icon={Trash2}
          destructive
          title="Delete this note?"
          description="It's hidden from the notes; the text and your reason stay in the audit log."
          submitLabel="Delete Note"
          successTitle="Note deleted"
          reasonPlaceholder="Kept in the audit log"
          run={(reason) => deleteTenantNote(deleting, reason)}
          onClose={() => setDeleting(null)}
        />
      )}
    </section>
  );
}
