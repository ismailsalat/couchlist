'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import {
  clearRecentSources,
  recentSourcesServerSnapshot,
  recentSourcesSnapshot,
  subscribeToRecentSources,
} from '@/lib/recent-sources';

/**
 * Recently viewed, read from this device's local storage.
 *
 * `useSyncExternalStore` is the right tool here: localStorage is an external
 * store, and this gives a server snapshot (empty) that matches the first
 * client render, so there is no hydration mismatch and no effect writing state
 * on mount.
 *
 * This is not a public browsing log. Nothing about it reaches the server, and
 * Erase removes it for good.
 */
export function RecentlyViewed() {
  const entries = useSyncExternalStore(
    subscribeToRecentSources,
    recentSourcesSnapshot,
    recentSourcesServerSnapshot,
  );

  if (entries.length === 0) return null;

  return (
    <section className="mt-6 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-lg font-semibold">Recently viewed on this device</h2>
        <button
          type="button"
          onClick={() => clearRecentSources()}
          className="cl-touch rounded-pill border border-line bg-bg px-3 py-1.5 text-sm text-text hover:bg-hover"
        >
          Erase this history
        </button>
      </div>
      <p className="m-0 mt-1 text-sm text-muted">
        Kept in this browser only. Never sent to Couchlist.
      </p>
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link
              href={`/sources/${entry.id}`}
              className="inline-flex rounded-pill border border-line bg-bg px-3 py-1.5 text-sm text-text no-underline hover:bg-hover"
            >
              {entry.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
