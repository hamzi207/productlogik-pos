import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TenantTeam } from "@/components/admin/tenant-team";
import { adminDate } from "@/components/admin/format";
import { SettingsLoading } from "@/components/settings/shop-settings-section";
import { getTenantDetail } from "@/lib/admin-data";
import { tenantParam } from "@/lib/admin-params";
import { getPlanLimits } from "@/lib/plan-limits-data";
import { getTeam } from "@/lib/team-data";

export const metadata: Metadata = { title: "Shop · Users" };

type Params = Promise<{ id: string }>;

async function Users({ params }: { params: Params }) {
  const id = await tenantParam(params);
  const [detail, members, limits] = await Promise.all([getTenantDetail(id), getTeam(id), getPlanLimits(id)]);
  if (!detail) notFound();
  return (
    <TenantTeam
      tenantId={id}
      ownerId={detail.tenant.owner_id}
      userLimit={limits.users}
      members={members.map((m) => ({
        id: m.id,
        fullName: m.fullName,
        email: m.email,
        role: m.role,
        status: m.status,
        lastSignIn: adminDate(m.lastSignInAt),
      }))}
    />
  );
}

/** Users tab: the organization's own Team manager, plus passwords, sign-out and ownership. */
export default function TenantUsersPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <Users params={params} />
    </Suspense>
  );
}
