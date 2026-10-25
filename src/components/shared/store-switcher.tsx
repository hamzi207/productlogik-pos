"use client";

import { useTransition } from "react";
import { Check, ChevronDown, Loader2, Store as StoreIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setCurrentStore } from "@/lib/actions/stores";
import { notify } from "@/lib/notify";
import type { Store } from "@/lib/stores";

type Props = {
  current: Pick<Store, "id" | "name" | "code">;
  /** Stores the member can work in. One store: shown, not switchable. */
  stores: Pick<Store, "id" | "name" | "code">[];
};

/**
 * Top bar (Phase 20): the current store, where new documents go and whose stock they invoice.
 * Every store's stock stays visible whichever store is picked.
 */
export function StoreSwitcher({ current, stores }: Props) {
  const [pending, startTransition] = useTransition();
  const chip = (
    <>
      {pending ? <Loader2 size={14} className="animate-spin" /> : <StoreIcon size={14} />}
      <span className="store-switcher-name">{current.name}</span>
    </>
  );
  if (stores.length < 2) {
    return (
      <span className="store-switcher is-static" title="Your store: new documents go here">
        {chip}
      </span>
    );
  }
  const pick = (id: string) =>
    startTransition(async () => {
      const result = await setCurrentStore(id);
      if (result.status === "error") notify.error("Store not changed", result.message);
      else notify.success(`Working in ${result.message}`, "New documents go to this store and use its stock.");
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="store-switcher" aria-label={`Current store: ${current.name}. Change store`} disabled={pending}>
          {chip}
          <ChevronDown size={13} className="store-switcher-caret" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <div className="text-sm font-semibold">Work in</div>
          <div className="text-xs font-normal text-muted-foreground">New documents go to this store and use its stock.</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {stores.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => s.id !== current.id && pick(s.id)}>
            {s.id === current.id ? <Check /> : <StoreIcon />}
            <span>{s.name}</span>
            {s.code && <span className="ml-auto text-xs text-muted-foreground">{s.code}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
