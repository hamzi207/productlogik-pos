"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import { TeamManager, type TeamRow } from "@/components/settings/team-manager";
import { BulkUsersImport } from "./bulk-users-import";
import { UserActions } from "./user-actions";

/** The organization's Team manager in the console, with the superadmin's per-member tools and CSV import. */
export function TenantTeam({ tenantId, ownerId, members, userLimit }: { tenantId: string; ownerId: string | null; members: TeamRow[]; userLimit: number | null }) {
  const [importing, setImporting] = useState(false);
  return (
    <div className="settings-form">
      <div className="tenant-team-bar">
        <span>Invite one person with Invite Team Member, or many at once from a CSV.</span>
        <button type="button" className="button" onClick={() => setImporting(true)}><FileUp size={14} /> Import CSV</button>
      </div>
      <TeamManager
        tenantId={tenantId}
        ownerId={ownerId}
        meId=""
        canEdit
        members={members}
        userLimit={userLimit}
        memberTools={(m) => (
          <UserActions
            userId={m.id}
            name={m.fullName}
            email={m.email}
            role={m.role}
            ownerOf={m.role === "admin" && m.status === "active" && m.id !== ownerId ? tenantId : undefined}
          />
        )}
      />
      {importing && <BulkUsersImport tenantId={tenantId} onClose={() => setImporting(false)} />}
    </div>
  );
}
