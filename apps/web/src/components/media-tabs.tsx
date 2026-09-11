"use client";

import { useState } from "react";

export type MediaTab = "overview" | "watch" | "friends";

const TABS: Array<{ value: MediaTab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "watch", label: "Watch" },
  { value: "friends", label: "Friends" },
];

/**
 * Section switcher for a title page.
 *
 * All three panels are rendered server-side and toggled here, so the Watch and
 * Friends data is present in the initial HTML rather than fetched on click.
 */
export function MediaTabs({
  overview,
  watch,
  friends,
}: {
  overview: React.ReactNode;
  watch: React.ReactNode;
  friends: React.ReactNode;
}) {
  const [active, setActive] = useState<MediaTab>("overview");

  return (
    <div className="mt-8">
      <div
        className="flex gap-1 border-b border-border"
        role="tablist"
        aria-label="Title sections"
      >
        {TABS.map((tab) => {
          const selected = active === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(tab.value)}
              className={
                selected
                  ? "-mb-px border-b-2 border-primary px-4 py-2.5 font-display text-sm font-bold text-text-primary"
                  : "-mb-px border-b-2 border-transparent px-4 py-2.5 font-display text-sm font-bold text-text-secondary transition hover:text-text-primary"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6" role="tabpanel">
        {active === "overview" ? overview : null}
        {active === "watch" ? watch : null}
        {active === "friends" ? friends : null}
      </div>
    </div>
  );
}
