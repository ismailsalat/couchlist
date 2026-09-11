"use client";

import { useState } from "react";

type Tab = "overview" | "members" | "sources";

export function ServerTabs({
  overview,
  members,
  sources,
}: {
  overview: React.ReactNode;
  members: React.ReactNode;
  sources: React.ReactNode;
}) {
  const [active, setActive] = useState<Tab>("overview");
  const tabs: Array<[Tab, string]> = [["overview", "Overview"], ["members", "Members"], ["sources", "Sources"]];
  return (
    <div className="mt-7">
      <div className="flex gap-1 border-b border-border" role="tablist" aria-label="Server sections">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active === value}
            onClick={() => setActive(value)}
            className={active === value
              ? "-mb-px border-b-2 border-primary px-4 py-3 font-display text-sm font-bold text-text-primary"
              : "-mb-px border-b-2 border-transparent px-4 py-3 font-display text-sm font-bold text-text-secondary hover:text-text-primary"}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6" role="tabpanel">
        {active === "overview" ? overview : null}
        {active === "members" ? members : null}
        {active === "sources" ? sources : null}
      </div>
    </div>
  );
}
