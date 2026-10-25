"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, MoreHorizontal, RotateCcw, Send, UserMinus, UserPlus, Users, X } from "lucide-react";
import { ConfirmDialog, type ConfirmRequest } from "@/components/quotes/confirm-dialog";
import { ModalSheet } from "@/components/shared/modal-sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cancelInvite, inviteTeamMember, resendInvite, setMemberActive, setMemberRole } from "@/lib/actions/team";
import { notify } from "@/lib/notify";
import { teamInviteSchema, TEAM_ROLE_LABEL, type TeamInviteInput, type TeamRole } from "@/lib/validations/team.schema";

export type TeamRow = {
  id: string;
  fullName: string;
  email: string;
  role: TeamRole;
  status: "active" | "invited" | "deactivated";
  /** Already formatted on the server ("19 Oct 2026" / "Never"). */
  lastSignIn: string;
};

const STATUS: Record<TeamRow["status"], { label: string; tone: string }> = {
  active: { label: "Active", tone: "badge badge-green" },
  invited: { label: "Invited", tone: "badge badge-amber" },
  deactivated: { label: "Deactivated", tone: "badge" },
};

const ROLE_CHOICES: { role: TeamRole; text: string }[] = [
  { role: "staff", text: "Quotations, invoices, payments, customers and stock." },
  { role: "admin", text: "Everything staff can do, plus settings and the team." },
];

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

type Props = {
  members: TeamRow[];
  meId: string;
  canEdit: boolean;
  /** Superadmin console: the organization being managed (audited). */
  tenantId?: string;
  /** The organization's owner (badge). */
  ownerId?: string | null;
  /** Superadmin console: extra per-member tools (passwords, sign-out, ownership). */
  memberTools?: (member: TeamRow) => ReactNode;
  /** Users the subscription allows (active + invited; null = no limit). */
  userLimit: number | null;
};

/**
 * Settings → Team: who can sign in to this shop, their role and status; invite, change, deactivate.
 * Invites and reactivations stay within the subscription's user limit (checked again in the database);
 * past it the superadmin raises the limit.
 */
export function TeamManager({ members, meId, canEdit, tenantId, ownerId, memberTools, userLimit }: Props) {
  const [inviting, setInviting] = useState(false);
  const counts = {
    active: members.filter((m) => m.status === "active").length,
    invited: members.filter((m) => m.status === "invited").length,
  };
  const full = userLimit !== null && counts.active + counts.invited >= userLimit;
  const included = userLimit === null ? null : `${userLimit} ${userLimit === 1 ? "user" : "users"}`;

  return (
    <section className="card settings-card">
      <div className="settings-card-head team-head">
        <span className="header-icon blue"><Users size={18} /></span>
        <div>
          <h2>Team</h2>
          <p>
            {counts.active} active{counts.invited ? ` · ${counts.invited} invited` : ""}
            {included ? ` of the ${included} the subscription includes` : ""}. Admins can change settings and the team; staff work with
            quotations, invoices, customers and stock.
          </p>
        </div>
        {canEdit && (tenantId || !full) && (
          <button type="button" className="button button-primary" disabled={Boolean(tenantId) && full} onClick={() => setInviting(true)}>
            <UserPlus size={14} /> Invite Team Member
          </button>
        )}
      </div>
      {canEdit && full && (
        <div className="form-alert form-alert-info team-alert" role="status">
          {tenantId
            ? `The subscription includes ${included} and all are taken. Raise its user limit on the Subscription tab to add another.`
            : `Your subscription includes ${included}. To add another, ask ProductLogik to update it (Subscription → Request a Plan Change), or deactivate someone who has left.`}
        </div>
      )}
      {!canEdit && (
        <div className="form-alert form-alert-info team-alert" role="status">
          Only shop admins can invite or change team members.
        </div>
      )}

      <ul className={`team-list${memberTools ? " has-tools" : ""}`} aria-label="Team members">
        {members.map((m) => (
          <TeamMemberRow key={m.id} member={m} isMe={m.id === meId} isOwner={m.id === ownerId} canEdit={canEdit} tenantId={tenantId} tools={memberTools?.(m)} />
        ))}
      </ul>

      <Dialog.Root open={inviting} onOpenChange={setInviting}>
        <ModalSheet className="modal modal-sm">{inviting && <InviteForm tenantId={tenantId} onDone={() => setInviting(false)} />}</ModalSheet>
      </Dialog.Root>
    </section>
  );
}

function TeamMemberRow({
  member: m,
  isMe,
  isOwner,
  canEdit,
  tenantId,
  tools,
}: {
  member: TeamRow;
  isMe: boolean;
  isOwner: boolean;
  canEdit: boolean;
  tenantId?: string;
  tools?: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const status = STATUS[m.status];

  const run = (fn: () => Promise<{ status: "success"; message?: string } | { status: "error"; message: string }>, failTitle: string, okTitle: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.status === "error") notify.error(failTitle, result.message);
      else notify.success(okTitle, result.message);
      setConfirm(null);
    });

  const changeRole = (role: TeamRole) => run(() => setMemberRole(m.id, role, tenantId), "Role not changed", "Role changed");
  const deactivate = () =>
    setConfirm({
      title: `Deactivate ${m.fullName}?`,
      body: (
        <p>
          They&apos;ll be signed out straight away and can&apos;t sign in until you reactivate them. Their quotations, invoices and payments
          stay in the shop.
        </p>
      ),
      confirmLabel: "Deactivate",
      icon: <UserMinus size={18} />,
      tone: "danger",
      onConfirm: () => run(() => setMemberActive(m.id, false, tenantId), "Not deactivated", "Member deactivated"),
    });
  const withdraw = () =>
    setConfirm({
      title: "Cancel this invitation?",
      body: <p>The invitation link for {m.email} stops working and they&apos;re removed from the team. You can invite them again later.</p>,
      confirmLabel: "Cancel invitation",
      icon: <X size={18} />,
      tone: "danger",
      onConfirm: () => run(() => cancelInvite(m.id, tenantId), "Invitation not cancelled", "Invitation cancelled"),
    });

  return (
    <li className={`team-row${m.status === "deactivated" ? " is-off" : ""}`}>
      <span className="avatar team-avatar" aria-hidden="true">{initials(m.fullName)}</span>
      <span className="team-who">
        <strong>
          {m.fullName}
          {isMe && <em className="team-you">You</em>}
          {isOwner && <em className="team-you">Owner</em>}
        </strong>
        <span>{m.email}</span>
      </span>
      <span className="team-meta">
        <span className={status.tone}>{status.label}</span>
        <span className="team-last">{m.status === "invited" ? "Not signed in yet" : `Last sign-in ${m.lastSignIn}`}</span>
      </span>
      <span className="team-role">
        {canEdit && m.status !== "deactivated" ? (
          <select
            className="admin-role-select"
            value={m.role}
            disabled={pending}
            aria-label={`Role for ${m.fullName}`}
            onChange={(e) => changeRole(e.target.value as TeamRole)}
          >
            <option value="staff">{TEAM_ROLE_LABEL.staff}</option>
            <option value="admin">{TEAM_ROLE_LABEL.admin}</option>
          </select>
        ) : (
          <span className="team-role-text">{TEAM_ROLE_LABEL[m.role]}</span>
        )}
      </span>
      <span className="team-actions">
        {tools}
        {canEdit && !isMe && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="icon-button" aria-label={`More for ${m.fullName}`} disabled={pending}>
                {pending ? <Loader2 size={15} className="animate-spin" /> : <MoreHorizontal size={15} />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {m.status === "invited" && (
                <>
                  <DropdownMenuItem onSelect={() => run(() => resendInvite(m.id, tenantId), "Invitation not sent", "Invitation sent")}>
                    <Send size={14} /> Resend invite
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={withdraw}>
                    <X size={14} /> Cancel invitation
                  </DropdownMenuItem>
                </>
              )}
              {m.status === "active" && (
                <DropdownMenuItem onSelect={deactivate}>
                  <UserMinus size={14} /> Deactivate
                </DropdownMenuItem>
              )}
              {m.status === "deactivated" && (
                <DropdownMenuItem onSelect={() => run(() => setMemberActive(m.id, true, tenantId), "Not reactivated", "Member reactivated")}>
                  <RotateCcw size={14} /> Reactivate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </span>
      <ConfirmDialog request={confirm} pending={pending} onOpenChange={(open) => !open && setConfirm(null)} />
    </li>
  );
}

function InviteForm({ onDone, tenantId }: { onDone: () => void; tenantId?: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TeamInviteInput>({
    resolver: zodResolver(teamInviteSchema),
    defaultValues: { fullName: "", email: "", role: "staff" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await inviteTeamMember(values, tenantId);
    if (result.status === "error") {
      setServerError(result.message);
      return;
    }
    notify.success("Team member invited", result.message);
    onDone();
  });

  const error = Object.values(errors)[0]?.message ?? serverError;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="modal-header">
        <div>
          <span className="header-icon blue"><Mail size={18} /></span>
          <div>
            <Dialog.Title asChild><h2>Invite team member</h2></Dialog.Title>
            <Dialog.Description asChild>
              <p>They get an email with a link to choose a password and join this shop.</p>
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close asChild>
          <button type="button" className="icon-button" aria-label="Close"><X size={16} /></button>
        </Dialog.Close>
      </div>
      <div className="modal-body">
        {error && <div className="form-alert form-alert-error modal-alert" role="alert">{error}</div>}
        <fieldset className="form-grid" disabled={isSubmitting}>
          <label className="span-two">
            <span>FULL NAME</span>
            <input {...register("fullName")} maxLength={120} autoFocus aria-invalid={errors.fullName ? true : undefined} />
          </label>
          <label className="span-two">
            <span>EMAIL</span>
            <input type="email" inputMode="email" autoComplete="off" {...register("email")} maxLength={200} aria-invalid={errors.email ? true : undefined} />
          </label>
          <div className="span-two team-role-pick">
            <span>ROLE</span>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <div className="radio-cards" role="radiogroup" aria-label="Role">
                  {ROLE_CHOICES.map((c) => (
                    <button
                      key={c.role}
                      type="button"
                      role="radio"
                      aria-checked={field.value === c.role}
                      className={field.value === c.role ? "selected" : undefined}
                      onClick={() => field.onChange(c.role)}
                    >
                      <span className="radio-dot" aria-hidden />
                      <strong>{TEAM_ROLE_LABEL[c.role]}</strong>
                      <p>{c.text}</p>
                    </button>
                  ))}
                </div>
              )}
            />
          </div>
          <label className="span-two">
            <small>The link works for 1 hour. Until they accept, they show as Invited and you can resend it.</small>
          </label>
        </fieldset>
      </div>
      <div className="modal-footer">
        <Dialog.Close asChild>
          <button type="button" className="button" disabled={isSubmitting}>Cancel</button>
        </Dialog.Close>
        <button type="submit" className="button button-primary" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send Invitation
        </button>
      </div>
    </form>
  );
}
