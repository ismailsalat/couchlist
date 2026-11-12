import 'server-only';
import type { Repositories } from '@/lib/db';

export interface StatusEntry {
  id: string;
  name: string;
  domain: string;
  state: 'up' | 'wobbly' | 'down' | 'unchecked';
  detail: string;
  lastCheckedAt: string | null;
}

export interface LiveStatus {
  entries: StatusEntry[];
  counts: { up: number; wobbly: number; down: number; unchecked: number; total: number };
  /** The most recent check of any source: how fresh this whole page is. */
  lastRunAt: string | null;
  /** How many domains the offline blocklists currently cover. */
  blocklistDomains: number;
  blocklists: Array<{ list: string; finishedAt: string | null; entryCount: number; ok: boolean }>;
  /**
   * What the scheduled maintenance last did, so "it has never run" and "it
   * runs and fails" are distinguishable rather than producing the same page.
   */
  maintenance: {
    /** A sentence for the reader, or null when there is nothing to say. */
    note: string | null;
    ok: boolean;
  };
}

/**
 * Build the status view.
 *
 * "unchecked" is its own state rather than being folded into "up". A source
 * nobody has checked is not a working source, and showing it green would
 * make the page a decoration instead of a report.
 *
 * So is "wobbly", for the opposite reason. One failed check is not evidence
 * that a website is down — it is equally likely to be our own server's DNS,
 * its network, or a host that dislikes our user agent that minute. Painting
 * that red tells every visitor a working site is broken, which is the kind of
 * confidently wrong answer that makes a tool worth less than no tool. A site
 * is only called down once it has missed two checks in a row, which is the
 * same evidence the moderator queue waits for.
 */
export async function liveStatus(repositories: Repositories): Promise<LiveStatus> {
  const [rows, blocklistDomains, blocklists, runs] = await Promise.all([
    repositories.sources.healthSnapshot(),
    repositories.tools.blockedDomainCount(),
    repositories.tools.lastSyncs(),
    // Never allowed to break the page: this is a diagnostic, and a status
    // board that fails to render because its own diagnostic failed would be
    // a poor joke.
    repositories.tools.lastMaintenanceRuns().catch(() => []),
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
        const failures = row.healthFailures ?? 0;
        if (failures > 1) {
          state = 'down';
          detail = `Has not answered for ${failures} checks in a row.`;
        } else {
          state = 'wobbly';
          detail = 'Missed our last check. That may well have been us.';
        }
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
  const order: Record<StatusEntry['state'], number> = { down: 0, wobbly: 1, unchecked: 2, up: 3 };
  entries.sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));

  return {
    entries,
    counts: {
      up: entries.filter((entry) => entry.state === 'up').length,
      wobbly: entries.filter((entry) => entry.state === 'wobbly').length,
      down: entries.filter((entry) => entry.state === 'down').length,
      unchecked: entries.filter((entry) => entry.state === 'unchecked').length,
      total: entries.length,
    },
    lastRunAt: lastRun ? lastRun.toISOString() : null,
    maintenance: describeMaintenance(runs, entries.length),
    blocklistDomains,
    blocklists: blocklists.map((entry) => ({
      ...entry,
      finishedAt: entry.finishedAt ? entry.finishedAt.toISOString() : null,
    })),
  };
}

/**
 * One sentence about the schedule itself.
 *
 * Only says anything when it would tell the reader something they cannot see
 * from the board: that the checks are failing, or that they are configured
 * and simply have not had their first run yet. When everything is working the
 * per-source rows already say so, and a line repeating it is noise.
 */
function describeMaintenance(
  runs: Array<{ job: string; startedAt: Date; finishedAt: Date | null; ok: boolean; detail: string | null }>,
  sourceCount: number,
): LiveStatus['maintenance'] {
  const linkCheck = runs.find((run) => run.job === 'link-check');

  if (!linkCheck) {
    // No attempt on record. Only worth saying when there is something that
    // should have been checked.
    return sourceCount > 0
      ? {
          note: 'The scheduled check has not run yet. It runs shortly after the site starts, then every six hours.',
          ok: false,
        }
      : { note: null, ok: true };
  }

  if (!linkCheck.finishedAt) {
    return {
      note: 'A check is running now, or the last one was interrupted before it finished.',
      ok: false,
    };
  }

  if (!linkCheck.ok) {
    const because = linkCheck.detail ? ` It reported: ${linkCheck.detail}` : '';
    return {
      note: `The last scheduled check failed, so the results below may be out of date.${because}`,
      ok: false,
    };
  }

  return { note: null, ok: true };
}
