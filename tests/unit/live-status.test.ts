import { describe, expect, it } from 'vitest';
import { liveStatus } from '../../apps/web/src/lib/tools/status';
import type { Repositories } from '../../apps/web/src/lib/db';

/**
 * The status board's judgement, which is the part that can be wrong in a way
 * a visitor would believe.
 *
 * The board reports on other people's websites from our server, so it has two
 * ways to mislead: calling a site that nobody has checked "working", and
 * calling a site that missed one request "down" when the failure was as
 * likely to be ours. Both are covered here.
 */
type Row = {
  id: string;
  name: string;
  domain: string | null;
  healthStatus: string | null;
  healthFailures: number;
  lastHealthCheckAt: Date | null;
};

type Run = {
  job: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean;
  detail: string | null;
};

function fakeRepos(rows: Row[], runs: Run[] = []): Repositories {
  return {
    sources: { healthSnapshot: async () => rows },
    tools: {
      blockedDomainCount: async () => 1234,
      lastSyncs: async () => [],
      lastMaintenanceRuns: async () => runs,
    },
  } as unknown as Repositories;
}

function run(over: Partial<Run> = {}): Run {
  return {
    job: 'link-check',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    finishedAt: new Date('2026-01-01T00:01:00.000Z'),
    ok: true,
    detail: null,
    ...over,
  };
}

const CHECKED = new Date('2026-01-01T00:00:00.000Z');

function row(over: Partial<Row> & { id: string }): Row {
  return {
    name: `Source ${over.id}`,
    domain: `${over.id}.test`,
    healthStatus: 'OK',
    healthFailures: 0,
    lastHealthCheckAt: CHECKED,
    ...over,
  };
}

describe('live status', () => {
  it('never counts an unchecked source as working', async () => {
    const status = await liveStatus(
      fakeRepos([row({ id: 'never', healthStatus: null, lastHealthCheckAt: null })]),
    );

    expect(status.counts.up).toBe(0);
    expect(status.counts.unchecked).toBe(1);
    expect(status.entries[0]?.state).toBe('unchecked');
    expect(status.lastRunAt).toBeNull();
  });

  it('calls one missed check wobbly, not down', async () => {
    const status = await liveStatus(
      fakeRepos([row({ id: 'blip', healthStatus: 'UNREACHABLE', healthFailures: 1 })]),
    );

    expect(status.entries[0]?.state).toBe('wobbly');
    expect(status.counts.down).toBe(0);
    expect(status.counts.wobbly).toBe(1);
    // The wording has to admit the doubt rather than blame the site.
    expect(status.entries[0]?.detail).toMatch(/may well have been us/iu);
  });

  it('calls it down once it has missed two in a row', async () => {
    const status = await liveStatus(
      fakeRepos([row({ id: 'dead', healthStatus: 'UNREACHABLE', healthFailures: 2 })]),
    );

    expect(status.entries[0]?.state).toBe('down');
    expect(status.counts.down).toBe(1);
    expect(status.entries[0]?.detail).toContain('2 checks in a row');
  });

  it('treats a redirect as still answering', async () => {
    const status = await liveStatus(
      fakeRepos([row({ id: 'moved', healthStatus: 'MOVED', healthFailures: 0 })]),
    );

    expect(status.entries[0]?.state).toBe('up');
    expect(status.counts.up).toBe(1);
  });

  it('orders worst first, so the page leads with what is broken', async () => {
    const status = await liveStatus(
      fakeRepos([
        row({ id: 'aaa-up' }),
        row({ id: 'bbb-unchecked', healthStatus: null, lastHealthCheckAt: null }),
        row({ id: 'ccc-wobbly', healthStatus: 'ERROR', healthFailures: 1 }),
        row({ id: 'ddd-down', healthStatus: 'ERROR', healthFailures: 4 }),
      ]),
    );

    expect(status.entries.map((entry) => entry.state)).toEqual([
      'down',
      'wobbly',
      'unchecked',
      'up',
    ]);
  });

  it('reports the freshest check as the age of the whole page', async () => {
    const older = new Date('2026-01-01T00:00:00.000Z');
    const newer = new Date('2026-02-02T00:00:00.000Z');

    const status = await liveStatus(
      fakeRepos([
        row({ id: 'old', lastHealthCheckAt: older }),
        row({ id: 'new', lastHealthCheckAt: newer }),
        row({ id: 'none', healthStatus: null, lastHealthCheckAt: null }),
      ]),
    );

    expect(status.lastRunAt).toBe(newer.toISOString());
    expect(status.counts.total).toBe(3);
  });
});

/**
 * The schedule's own health.
 *
 * A board whose checks are failing and a board whose checks have never been
 * set up look identical — every source unchecked — so the page has to say
 * which it is. This is the difference between "it is broken" and "give it a
 * minute", and the reader cannot work it out from the rows.
 */
describe('what the board says about the schedule itself', () => {
  it('says the check has not run yet when nothing is on record', async () => {
    const status = await liveStatus(
      fakeRepos([row({ id: 'a', healthStatus: null, lastHealthCheckAt: null })], []),
    );

    expect(status.maintenance.ok).toBe(false);
    expect(status.maintenance.note).toMatch(/has not run yet/iu);
  });

  it('says so, and why, when the last check failed', async () => {
    const status = await liveStatus(
      fakeRepos(
        [row({ id: 'a' })],
        [run({ ok: false, detail: 'getaddrinfo EAI_AGAIN' })],
      ),
    );

    expect(status.maintenance.ok).toBe(false);
    expect(status.maintenance.note).toMatch(/failed/iu);
    // The reason is shown, so the operator is not left guessing.
    expect(status.maintenance.note).toContain('getaddrinfo EAI_AGAIN');
  });

  it('flags a pass that started and never finished', async () => {
    const status = await liveStatus(
      fakeRepos([row({ id: 'a' })], [run({ finishedAt: null, ok: false })]),
    );

    expect(status.maintenance.ok).toBe(false);
    expect(status.maintenance.note).toMatch(/interrupted|running now/iu);
  });

  it('stays quiet when the schedule is working', async () => {
    const status = await liveStatus(fakeRepos([row({ id: 'a' })], [run()]));

    expect(status.maintenance.ok).toBe(true);
    // The rows already say everything. A banner repeating it is noise.
    expect(status.maintenance.note).toBeNull();
  });

  it('stays quiet when there is nothing listed to check', async () => {
    const status = await liveStatus(fakeRepos([], []));

    expect(status.maintenance.note).toBeNull();
  });

  it('renders even if the diagnostic query itself fails', async () => {
    const broken = {
      sources: { healthSnapshot: async () => [row({ id: 'a' })] },
      tools: {
        blockedDomainCount: async () => 0,
        lastSyncs: async () => [],
        lastMaintenanceRuns: async () => {
          throw new Error('table missing');
        },
      },
    } as unknown as Repositories;

    // A status board that cannot render because its own diagnostic broke
    // would be a poor joke.
    const status = await liveStatus(broken);
    expect(status.entries).toHaveLength(1);
  });
});
