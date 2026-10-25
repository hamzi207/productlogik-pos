"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, FileText, Globe, Printer, Receipt, Ruler, Store, Tags, UserCog, Users } from "lucide-react";

export const SETTINGS_TABS = [
  { href: "/settings", label: "Profile", icon: Store },
  { href: "/settings/localization", label: "Localization", icon: Globe },
  { href: "/settings/categories", label: "Categories", icon: Tags },
  { href: "/settings/units", label: "Units", icon: Ruler },
  { href: "/settings/customers", label: "Customers", icon: UserCog },
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/documents", label: "Documents", icon: FileText },
  { href: "/settings/printing", label: "Printing", icon: Printer },
  { href: "/settings/pos", label: "POS", icon: Receipt },
  { href: "/settings/subscription", label: "Subscription", icon: CreditCard },
] as const;

/** The Settings sections; `pathname` null while prerendering (nothing highlighted). */
export function SettingsTabList({ pathname }: { pathname: string | null }) {
  const nav = useRef<HTMLElement>(null);
  // Phones: the bar scrolls sideways, so bring the current tab into view.
  useEffect(() => {
    const bar = nav.current;
    const active = bar?.querySelector<HTMLElement>("a.active");
    if (!bar || !active) return;
    const left = active.offsetLeft - bar.offsetLeft;
    if (left < bar.scrollLeft || left + active.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollLeft = left - (bar.clientWidth - active.offsetWidth) / 2;
    }
  }, [pathname]);
  return (
    <nav ref={nav} className="settings-tabs" aria-label="Settings sections">
      {SETTINGS_TABS.map(({ href, label, icon: Icon }) => {
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

export function SettingsTabs() {
  return <SettingsTabList pathname={usePathname()} />;
}
