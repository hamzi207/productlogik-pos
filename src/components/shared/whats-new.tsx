"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { Gift, X } from "lucide-react";
import { ModalSheet } from "./modal-sheet";
import { markWhatsNewSeen } from "@/lib/actions/whats-new";
import { CHANGELOG, LATEST_CHANGELOG_ID } from "@/lib/changelog";
import { formatDay } from "@/lib/format";

/** Top-bar "What's new" (RF-16.3): a dot until this user opens the latest entry; opening it clears the dot. */
export function WhatsNew({ seen }: { seen: string | null }) {
  const [seenId, setSeenId] = useState(seen);
  const unseen = LATEST_CHANGELOG_ID !== null && seenId !== LATEST_CHANGELOG_ID;
  // Entries newer than what this user last saw get a "New" tag (all of them if they never opened it).
  const seenIndex = seenId ? CHANGELOG.findIndex((e) => e.id === seenId) : -1;
  const isNew = (i: number) => unseen && (seenIndex === -1 || i < seenIndex);

  const [saved, setSaved] = useState(false);

  const onOpenChange = (open: boolean) => {
    if (!unseen || !LATEST_CHANGELOG_ID) return;
    const latest = LATEST_CHANGELOG_ID;
    if (open) void markWhatsNewSeen(latest).then((r) => setSaved(r.status === "success"));
    // The "New" tags stay while it's open; the dot goes when it closes.
    else if (saved) setSeenId(latest);
  };

  if (CHANGELOG.length === 0) return null;
  return (
    <Dialog.Root onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button type="button" className="notification" aria-label={unseen ? "What's new (new updates)" : "What's new"} title="What's new">
          <Gift size={18} />
          {unseen && <span className="whats-new-dot" aria-hidden />}
        </button>
      </Dialog.Trigger>
      <ModalSheet className="modal">
        <div className="modal-header">
          <div>
            <span className="header-icon blue"><Gift size={18} /></span>
            <div>
              <Dialog.Title asChild><h2>What&apos;s new</h2></Dialog.Title>
              <Dialog.Description asChild><p>Recent improvements to ProductLogik Invoicing System.</p></Dialog.Description>
            </div>
          </div>
          <Dialog.Close asChild>
            <button type="button" className="icon-button" aria-label="Close"><X size={16} /></button>
          </Dialog.Close>
        </div>
        <div className="modal-body whats-new-list">
          {CHANGELOG.map((entry, i) => (
            <section key={entry.id} className="whats-new-entry">
              <header>
                <h3>{entry.title}</h3>
                {isNew(i) && <span className="whats-new-tag">New</span>}
                <time dateTime={entry.date}>{formatDay(entry.date)}</time>
              </header>
              <ul>
                {entry.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>
      </ModalSheet>
    </Dialog.Root>
  );
}
