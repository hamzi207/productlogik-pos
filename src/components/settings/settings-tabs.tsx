"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, FileText, Globe, Receipt, Ruler, Store, Tags, UserCog, Users, Warehouse } from "lucide-react";

export const SETTINGS_TABS = [
  { href: "/settings", label: "Profile", icon: Store },
  { href: "/settings/localization", label: "Localization", short: "Locale", icon: Globe },
  { href: "/settings/categories", label: "Categories", icon: Tags },
  { href: "/settings/units", label: "Units", icon: Ruler },
  { href: "/settings/customers", label: "Customers", icon: UserCog },
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/stores", label: "Stores", icon: Warehouse },
  { href: "/settings/documents", label: "Documents", icon: FileText },
  { href: "/settings/printing", label: "Tax & Printing", short: "Tax", icon: Receipt },
  { href: "/settings/subscription", label: "Subscription", short: "Plan", icon: CreditCard },
] as const;

/**
 * A tab bar (Settings, the console's organization page) that stays on one row: as it narrows it
 * tightens the tabs, then drops their icons, then shortens long labels (`data-fit` 1–3); only past
 * that does it scroll sideways, with the current tab brought into view.
 */
export function useTabBar(pathname: string | null) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = nav.current;
    if (!bar) return;
    const fit = () => {
      for (let level = 0; level <= 3; level++) {
        bar.dataset.fit = String(level);
        if (bar.scrollWidth <= bar.clientWidth) break;
      }
    };
    fit();
    void document.fonts?.ready.then(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const bar = nav.current;
    const active = bar?.querySelector<HTMLElement>("a.active");
    if (!bar || !active) return;
    const left = active.offsetLeft - bar.offsetLeft;
    if (left < bar.scrollLeft || left + active.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollLeft = left - (bar.clientWidth - active.offsetWidth) / 2;
    }
  }, [pathname]);
  return nav;
}

/** A tab's label, with its shorter form for a tight bar. */
export function TabLabel({ label, short }: { label: string; short?: string }) {
  if (!short) return <>{label}</>;
  return (
    <>
      <span className="tab-long">{label}</span>
      <span className="tab-short" aria-hidden="true">{short}</span>
    </>
  );
}

/** The Settings sections; `pathname` null while prerendering (nothing highlighted). */
export function SettingsTabList({ pathname }: { pathname: string | null }) {
  const nav = useTabBar(pathname);
  return (
    <nav ref={nav} className="settings-tabs" aria-label="Settings sections">
      {SETTINGS_TABS.map((tab) => {
        const { href, label, icon: Icon } = tab;
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

export function SettingsTabs() {
  return <SettingsTabList pathname={usePathname()} />;
}
