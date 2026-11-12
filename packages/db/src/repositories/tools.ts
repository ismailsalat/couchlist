import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { blockedDomains, blocklistSyncs, domainReputation, maintenanceRuns } from '../schema.js';

export interface BlocklistHit {
  list: string;
  category: 'PHISHING' | 'MALWARE' | 'ADS';
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface CachedReputation {
  provider: string;
  status: 'clean' | 'flagged' | 'unknown' | 'unavailable';
  detail: string | null;
  checkedAt: Date;
  expiresAt: Date;
}

/**
 * Reads and writes for the three tool tables.
 *
 * The read path is deliberately tiny — one indexed lookup per question —
 * because it sits in front of a public form and must stay cheap under the
 * kind of traffic a public form attracts.
 */
export class ToolsRepository {
  constructor(private readonly db: Database) {}

  /** Every list that names this domain. Empty when nothing does. */
  async blocklistHits(domains: readonly string[]): Promise<Map<string, BlocklistHit[]>> {
    const result = new Map<string, BlocklistHit[]>();
    if (domains.length === 0) return result;

    const rows = await this.db
      .select()
      .from(blockedDomains)
      .where(inArray(blockedDomains.domain, [...domains]));

    for (const row of rows) {
      const list = result.get(row.domain) ?? [];
      list.push({
        list: row.list,
        category: row.category as BlocklistHit['category'],
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
      });
      result.set(row.domain, list);
    }
    return result;
  }

  /** Cached provider answers that have not expired. */
  async freshReputation(domain: string): Promise<CachedReputation[]> {
    const rows = await this.db
      .select()
      .from(domainReputation)
      .where(and(eq(domainReputation.domain, domain), gt(domainReputation.expiresAt, new Date())));

    return rows.map((row) => ({
      provider: row.provider,
      status: row.status as CachedReputation['status'],
      detail: row.detail,
      checkedAt: row.checkedAt,
      expiresAt: row.expiresAt,
    }));
  }

  /** Record what a provider said, replacing any earlier answer for it. */
  async cacheReputation(input: {
    domain: string;
    provider: string;
    status: CachedReputation['status'];
    detail?: string | null;
    expiresAt: Date;
  }): Promise<void> {
    await this.db
      .insert(domainReputation)
      .values({
        domain: input.domain,
        provider: input.provider,
        status: input.status,
        detail: input.detail ?? null,
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: [domainReputation.domain, domainReputation.provider],
        set: {
          status: input.status,
          detail: input.detail ?? null,
          checkedAt: new Date(),
          expiresAt: input.expiresAt,
        },
      });
  }

  /** Drop expired cache rows. Called by the weekly job, not by requests. */
  async pruneReputation(): Promise<number> {
    const result = await this.db.execute(
      sql`delete from domain_reputation where expires_at < now() - interval '7 days'`,
    );
    return result.rowCount ?? 0;
  }

  /** Insert or refresh a batch of blocklist entries. */
  async upsertBlockedDomains(
    list: string,
    category: BlocklistHit['category'],
    domains: readonly string[],
  ): Promise<number> {
    if (domains.length === 0) return 0;

    const now = new Date();
    const rows = domains.map((domain) => ({ domain, list, category, lastSeenAt: now }));

    await this.db
      .insert(blockedDomains)
      .values(rows)
      .onConflictDoUpdate({
        target: [blockedDomains.domain, blockedDomains.list],
        set: { lastSeenAt: now, category },
      });

    return rows.length;
  }

  /**
   * Remove entries of one list that the latest sync did not mention.
   *
   * A domain dropping off a blocklist is meaningful — it usually means it was
   * cleaned up or taken down — so stale entries must not linger and keep
   * producing warnings about a site that is no longer flagged.
   */
  async pruneList(list: string, before: Date): Promise<number> {
    const result = await this.db.execute(
      sql`delete from blocked_domains where list = ${list} and last_seen_at < ${before.toISOString()}`,
    );
    return result.rowCount ?? 0;
  }

  async startSync(list: string): Promise<string> {
    const [row] = await this.db.insert(blocklistSyncs).values({ list }).returning();
    return row!.id;
  }

  async finishSync(id: string, input: { ok: boolean; entryCount: number; detail?: string }): Promise<void> {
    await this.db
      .update(blocklistSyncs)
      .set({
        ok: input.ok,
        entryCount: input.entryCount,
        detail: input.detail ?? null,
        finishedAt: new Date(),
      })
      .where(eq(blocklistSyncs.id, id));
  }

  /** The most recent run of each list, for the status page. */
  async lastSyncs(): Promise<
    Array<{ list: string; finishedAt: Date | null; entryCount: number; ok: boolean }>
  > {
    const rows = await this.db
      .select()
      .from(blocklistSyncs)
      .orderBy(desc(blocklistSyncs.startedAt))
      .limit(50);

    const seen = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!seen.has(row.list)) seen.set(row.list, row);

    return [...seen.values()].map((row) => ({
      list: row.list,
      finishedAt: row.finishedAt,
      entryCount: row.entryCount,
      ok: row.ok,
    }));
  }

  /** Record that a maintenance job has started. Returns its row id. */
  async startMaintenanceRun(job: string): Promise<string> {
    const [row] = await this.db.insert(maintenanceRuns).values({ job }).returning();
    return row!.id;
  }

  async finishMaintenanceRun(
    id: string,
    input: { ok: boolean; detail?: string },
  ): Promise<void> {
    await this.db
      .update(maintenanceRuns)
      .set({
        ok: input.ok,
        // Trimmed: this is shown to readers, so it must stay a sentence
        // rather than becoming a stack trace on a public page.
        detail: input.detail ? input.detail.slice(0, 200) : null,
        finishedAt: new Date(),
      })
      .where(eq(maintenanceRuns.id, id));
  }

  /**
   * The most recent run of each maintenance job.
   *
   * Includes runs that started and never finished: a pass killed mid-flight
   * (a redeploy, an out-of-memory kill) leaves `finishedAt` null, and that is
   * exactly the state worth being able to see.
   */
  async lastMaintenanceRuns(): Promise<
    Array<{ job: string; startedAt: Date; finishedAt: Date | null; ok: boolean; detail: string | null }>
  > {
    const rows = await this.db
      .select()
      .from(maintenanceRuns)
      .orderBy(desc(maintenanceRuns.startedAt))
      .limit(50);

    const seen = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!seen.has(row.job)) seen.set(row.job, row);

    return [...seen.values()].map((row) => ({
      job: row.job,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      ok: row.ok,
      detail: row.detail,
    }));
  }

  /** How many domains the offline tier currently covers. */
  async blockedDomainCount(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(blockedDomains);
    return row?.count ?? 0;
  }
}
