"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Blocks, Building2, CreditCard, Database, FileText, FolderTree, Globe, History, LayoutDashboard, Package, Printer, Ruler, Users } from "lucide-react";

// The organization page's tabs (Phase 17, deliverable 3): each renders the organization's own
// settings form, saved to it and audited. Later phases add their tabs here.
const TABS = [
  { path: "", label: "Overview", icon: LayoutDashboard },
  { path: "/profile", label: "Profile", icon: Building2 },
  { path: "/localization", label: "Localization", icon: Globe },
  { path: "/documents", label: "Documents", icon: FileText },
  { path: "/printing", label: "Printing & POS", icon: Printer },
  { path: "/products", label: "Products", icon: Package },
  { path: "/categories", label: "Categories", icon: FolderTree },
  { path: "/lists", label: "Units & customers", icon: Ruler },
  { path: "/industry", label: "Industry & modules", icon: Blocks },
  { path: "/users", label: "Users", icon: Users },
  { path: "/subscription", label: "Subscription", icon: CreditCard },
  { path: "/data", label: "Data", icon: Database },
  { path: "/activity", label: "Activity", icon: History },
] as const;

/** `pathname` null while prerendering (nothing highlighted). */
export function TenantTabList({ tenantId, pathname }: { tenantId: string; pathname: string | null }) {
  const base = `/admin/tenants/${tenantId}`;
  return (
    <nav className="settings-tabs" aria-label="Organization sections">
      {TABS.map(({ path, label, icon: Icon }) => {
        const href = base + path;
        const active = pathname === href;
        return (
          <Link key={href} href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            <Icon size={14} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TenantTabs({ tenantId }: { tenantId: string }) {
  return <TenantTabList tenantId={tenantId} pathname={usePathname()} />;
}
