import { Suspense } from "react";
import { getShopSession } from "@/lib/auth";
import { getStoreContext } from "@/lib/store";
import { GlobalSearch } from "./global-search";
import { MobileNavButton } from "./mobile-nav";
import { NotificationBell } from "./notification-bell";
import { StoreSwitcher } from "./store-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { WhatsNew } from "./whats-new";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

async function ProfileSection() {
  const session = await getShopSession();
  return (
    <UserMenu
      initials={initials(session.fullName)}
      fullName={session.fullName}
      email={session.email}
      roleLabel={session.impersonating ? "Superadmin (acting)" : session.role === "admin" ? "Shop Administrator" : "Staff"}
    />
  );
}

async function WhatsNewSection() {
  const session = await getShopSession();
  // A superadmin acting as the shop doesn't get the shop's What's new.
  if (session.impersonating) return null;
  return <WhatsNew seen={session.whatsNewSeen} />;
}

/** Phase 20: the current store, once the organization has more than one. */
async function StoreSection() {
  const ctx = await getStoreContext();
  if (!ctx.multi) return null;
  const pick = ({ id, name, code }: { id: string; name: string; code: string | null }) => ({ id, name, code });
  return <StoreSwitcher current={pick(ctx.current)} stores={ctx.workStores.map(pick)} />;
}

/** Top bar ported from design/figma-ui/src/App.tsx: global search (Ctrl/⌘ K), light/dark, notifications, profile. */
export function TopNavbar() {
  return (
    <header className="topbar">
      <MobileNavButton />
      <GlobalSearch />
      <div className="top-actions">
        <Suspense fallback={null}>
          <StoreSection />
        </Suspense>
        <Suspense fallback={null}>
          <WhatsNewSection />
        </Suspense>
        <ThemeToggle />
        <NotificationBell />
        <Suspense fallback={<div className="profile"><div className="avatar" /></div>}>
          <ProfileSection />
        </Suspense>
      </div>
    </header>
  );
}
