"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Tag } from "lucide-react";
import { tagStyle } from "@/components/customers/customer-tags";
import type { CustomerTag } from "@/lib/customer-lists";

/** RF-19.2: limits the report's customer-based figures to customers with one tag (?tag=, dates kept). */
export function ReportTagFilter({ tags, value }: { tags: CustomerTag[]; value: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const active = tags.find((t) => t.id === value);

  const choose = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set("tag", id);
    else next.delete("tag");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <label className={`tag-filter report-tag-filter${active ? " is-on" : ""}`} style={active ? tagStyle(active.color) : undefined}>
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
      <span className="sr-only">Customer tag</span>
      <select value={active ? active.id : ""} onChange={(e) => choose(e.target.value)}>
        <option value="">All customers</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id}>Tagged {t.name}</option>
        ))}
      </select>
    </label>
  );
}
