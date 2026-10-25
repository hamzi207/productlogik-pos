"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Blocks, Building2, CreditCard, Database, FileText, FolderTree, Globe, History, LayoutDashboard, Package, Receipt, Ruler, Users, Warehouse } from "lucide-react";
import { TabLabel, useTabBar } from "@/components/settings/settings-tabs";

// The organization page's tabs (Phase 17, deliverable 3): each renders the organization's own
// settings form, saved to it and audited. Later phases add their tabs here.
const TABS = [
  { path: "", label: "Overview", icon: LayoutDashboard },
  { path: "/profile", label: "Profile", icon: Building2 },
  { path: "/localization", label: "Localization", icon: Globe },
  { path: "/documents", label: "Documents", icon: FileText },
  { path: "/printing", label: "Tax & Printing", short: "Tax", icon: Receipt },
  { path: "/products", label: "Products", icon: Package },
  { path: "/categories", label: "Categories", icon: FolderTree },
  { path: "/lists", label: "Units & customers", short: "Units", icon: Ruler },
  { path: "/industry", label: "Industry & modules", short: "Industry", icon: Blocks },
  { path: "/users", label: "Users", icon: Users },
  { path: "/stores", label: "Stores", icon: Warehouse },
  { path: "/subscription", label: "Subscription", short: "Plan", icon: CreditCard },
  { path: "/data", label: "Data", icon: Database },
  { path: "/activity", label: "Activity", icon: History },
] as const;

/** `pathname` null while prerendering (nothing highlighted). One row, as Settings (`useTabBar`). */
export function TenantTabList({ tenantId, pathname }: { tenantId: string; pathname: string | null }) {
  const base = `/admin/tenants/${tenantId}`;
  const nav = useTabBar(pathname);
  return (
    <nav ref={nav} className="settings-tabs" aria-label="Organization sections">
      {TABS.map((tab) => {
        const { path, label, icon: Icon } = tab;
        const href = base + path;
        const active = pathname === href;
        return (
          <Link key={href} href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined} title={label}>
            <Icon size={14} /> <TabLabel label={label} short={"short" in tab ? tab.short : undefined} />
          </Link>
        );
      })}
    </nav>
  );
}

export function TenantTabs({ tenantId }: { tenantId: string }) {
  return <TenantTabList tenantId={tenantId} pathname={usePathname()} />;
}
