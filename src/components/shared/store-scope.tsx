"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Warehouse } from "lucide-react";
import { ALL_STORES } from "@/lib/stores";

/**
 * "Liberty Market | All stores" for lists, the dashboard and reports (Phase 20), kept in the URL as
 * ?store=all. Shown only with more than one store, to members who may see them all.
 */
export function StoreScope({ storeName, all }: { storeName: string; all: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const pick = (showAll: boolean) => {
    const next = new URLSearchParams(params);
    if (showAll) next.set("store", ALL_STORES);
    else next.delete("store");
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return (
    <div className="store-scope" role="group" aria-label="Store">
      {pending ? <Loader2 size={13} className="animate-spin" /> : <Warehouse size={13} />}
      <button type="button" className={all ? "" : "active"} aria-pressed={!all} onClick={() => pick(false)}>
        {storeName}
      </button>
      <button type="button" className={all ? "active" : ""} aria-pressed={all} onClick={() => pick(true)}>
        All stores
      </button>
    </div>
  );
}
