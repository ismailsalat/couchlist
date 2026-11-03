import 'server-only';
import type { Repositories } from '@/lib/db';

export interface StatusEntry {
  id: string;
  name: string;
  domain: string;
  state: 'up' | 'down' | 'unchecked';
  detail: string;
  lastCheckedAt: string | null;
}

export interface LiveStatus {
  entries: StatusEntry[];
  counts: { up: number; down: number; unchecked: number; total: number };
  /** The most recent check of any source: how fresh this whole page is. */
  lastRunAt: string | null;
  /** How many domains the offline blocklists currently cover. */
  blocklistDomains: number;
  blocklists: Array<{ list: string; finishedAt: string | null; entryCount: number; ok: boolean }>;
}

/**
 * Build the status view.
 *
 * "unchecked" is its own state rather than being folded into "up". A source
 * nobody has checked is not a working source, and showing it green would
 * make the page a decoration instead of a report.
 */
export async function liveStatus(repositories: Repositories): Promise<LiveStatus> {
  const [rows, blocklistDomains, blocklists] = await Promise.all([
    repositories.sources.healthSnapshot(),
    repositories.tools.blockedDomainCount(),
    repositories.tools.lastSyncs(),
  ]);

  const entries: StatusEntry[] = [];
  let lastRun: Date | null = null;

  for (const row of rows) {
    const checkedAt = row.lastHealthCheckAt ?? null;
    if (checkedAt && (!lastRun || checkedAt > lastRun)) lastRun = checkedAt;

    let state: StatusEntry['state'] = 'unchecked';
    let detail = 'Not checked yet.';

    if (checkedAt) {
      if (row.healthStatus === 'OK') {
        state = 'up';
        detail = 'Answering normally.';
      } else if (row.healthStatus === 'MOVED') {
        state = 'up';
        detail = 'Answering, but it redirects somewhere else.';
      } else {
        state = 'down';
        const failures = row.healthFailures ?? 0;
        detail =
          failures > 1
            ? `Has not answered for ${failures} checks in a row.`
            : 'Did not answer the last check.';
      }
    }

    entries.push({
      id: row.id,
      name: row.name,
      domain: row.domain ?? '',
      state,
      detail,
      lastCheckedAt: checkedAt ? checkedAt.toISOString() : null,
    });
  }

  // Down first: this page exists to show what is broken.
  const order: Record<StatusEntry['state'], number> = { down: 0, unchecked: 1, up: 2 };
  entries.sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));

  return {
    entries,
    counts: {
      up: entries.filter((entry) => entry.state === 'up').length,
      down: entries.filter((entry) => entry.state === 'down').length,
      unchecked: entries.filter((entry) => entry.state === 'unchecked').length,
      total: entries.length,
    },
    lastRunAt: lastRun ? lastRun.toISOString() : null,
    blocklistDomains,
    blocklists: blocklists.map((entry) => ({
      ...entry,
      finishedAt: entry.finishedAt ? entry.finishedAt.toISOString() : null,
    })),
  };
}
