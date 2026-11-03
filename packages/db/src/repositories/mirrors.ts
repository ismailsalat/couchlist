import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { watchSourceDomains, watchSources } from '../schema.js';
import type { Database } from '../client.js';

export interface Mirror {
  id: string;
  domain: string;
  homepageUrl: string;
  isPrimary: boolean;
  isConfirmed: boolean;
  note: string | null;
  createdAt: Date;
}

/**
 * The addresses a listing answers on.
 *
 * These sites change domain constantly, and before this a listing and an
 * address were the same thing: when the address died the votes, the credit
 * and the description died with it, and somebody re-added the same site as a
 * stranger a week later. A listing is a site. A row here is one of the places
 * that site currently lives.
 *
 * The distinction that matters is `isConfirmed`. A mirror the link checker
 * noticed from a redirect is only a proposal, because the site being checked
 * chooses where its redirect points — accepting one automatically would let a
 * listed site write its own addresses into the directory. A person promotes
 * it or throws it away.
 */
export class MirrorRepository {
  constructor(private readonly db: Database) {}

  async forSource(sourceId: string): Promise<Mirror[]> {
    return this.db
      .select({
        id: watchSourceDomains.id,
        domain: watchSourceDomains.domain,
        homepageUrl: watchSourceDomains.homepageUrl,
        isPrimary: watchSourceDomains.isPrimary,
        isConfirmed: watchSourceDomains.isConfirmed,
        note: watchSourceDomains.note,
        createdAt: watchSourceDomains.createdAt,
      })
      .from(watchSourceDomains)
      .where(eq(watchSourceDomains.watchSourceId, sourceId))
      .orderBy(desc(watchSourceDomains.isPrimary), asc(watchSourceDomains.domain));
  }

  /** Confirmed mirrors for several listings at once, for the directory. */
  async forSources(sourceIds: string[]): Promise<Map<string, Mirror[]>> {
    const byId = new Map<string, Mirror[]>();
    if (sourceIds.length === 0) return byId;

    const rows = await this.db
      .select({
        sourceId: watchSourceDomains.watchSourceId,
        id: watchSourceDomains.id,
        domain: watchSourceDomains.domain,
        homepageUrl: watchSourceDomains.homepageUrl,
        isPrimary: watchSourceDomains.isPrimary,
        isConfirmed: watchSourceDomains.isConfirmed,
        note: watchSourceDomains.note,
        createdAt: watchSourceDomains.createdAt,
      })
      .from(watchSourceDomains)
      .where(
        and(
          inArray(watchSourceDomains.watchSourceId, sourceIds),
          eq(watchSourceDomains.isConfirmed, true),
        ),
      )
      .orderBy(desc(watchSourceDomains.isPrimary), asc(watchSourceDomains.domain));

    for (const { sourceId, ...mirror } of rows) {
      const list = byId.get(sourceId) ?? [];
      list.push(mirror);
      byId.set(sourceId, list);
    }
    return byId;
  }

  /**
   * Every address for several listings, proposals included.
   *
   * The admin list needs the proposals; the public directory must never see
   * them, which is why `forSources` is a separate method rather than a flag
   * somebody can forget to pass.
   */
  async forSourcesIncludingProposed(sourceIds: string[]): Promise<Map<string, Mirror[]>> {
    const byId = new Map<string, Mirror[]>();
    if (sourceIds.length === 0) return byId;

    const rows = await this.db
      .select({
        sourceId: watchSourceDomains.watchSourceId,
        id: watchSourceDomains.id,
        domain: watchSourceDomains.domain,
        homepageUrl: watchSourceDomains.homepageUrl,
        isPrimary: watchSourceDomains.isPrimary,
        isConfirmed: watchSourceDomains.isConfirmed,
        note: watchSourceDomains.note,
        createdAt: watchSourceDomains.createdAt,
      })
      .from(watchSourceDomains)
      .where(inArray(watchSourceDomains.watchSourceId, sourceIds))
      .orderBy(desc(watchSourceDomains.isPrimary), asc(watchSourceDomains.domain));

    for (const { sourceId, ...mirror } of rows) {
      const list = byId.get(sourceId) ?? [];
      list.push(mirror);
      byId.set(sourceId, list);
    }
    return byId;
  }

  /** Which listing, if any, already claims this address. */
  async findSourceIdByDomain(domain: string): Promise<string | undefined> {
    const rows = await this.db
      .select({ sourceId: watchSourceDomains.watchSourceId })
      .from(watchSourceDomains)
      .where(eq(watchSourceDomains.domain, domain))
      .limit(1);
    return rows[0]?.sourceId;
  }

  /**
   * Records an address for a listing.
   *
   * Returns null when another listing already claims it, which is the case
   * worth refusing: two listings for one site is the ambiguity this table
   * exists to remove.
   */
  async add(input: {
    sourceId: string;
    domain: string;
    homepageUrl: string;
    isConfirmed: boolean;
    note?: string | null;
    addedByUserId?: string | null;
  }): Promise<Mirror | null> {
    const owner = await this.findSourceIdByDomain(input.domain);
    if (owner && owner !== input.sourceId) return null;
    if (owner === input.sourceId) {
      const existing = await this.db
        .select()
        .from(watchSourceDomains)
        .where(eq(watchSourceDomains.domain, input.domain))
        .limit(1);
      const row = existing[0];
      if (row) {
        return {
          id: row.id,
          domain: row.domain,
          homepageUrl: row.homepageUrl,
          isPrimary: row.isPrimary,
          isConfirmed: row.isConfirmed,
          note: row.note,
          createdAt: row.createdAt,
        };
      }
    }

    const rows = await this.db
      .insert(watchSourceDomains)
      .values({
        watchSourceId: input.sourceId,
        domain: input.domain,
        homepageUrl: input.homepageUrl,
        isPrimary: false,
        isConfirmed: input.isConfirmed,
        note: input.note ?? null,
        addedByUserId: input.addedByUserId ?? null,
      })
      .returning();

    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      domain: row.domain,
      homepageUrl: row.homepageUrl,
      isPrimary: row.isPrimary,
      isConfirmed: row.isConfirmed,
      note: row.note,
      createdAt: row.createdAt,
    };
  }

  /**
   * Makes an address the one the listing shows and the checker visits.
   *
   * The listing's own domain and homepage move with it, so everything that
   * reads `watch_sources` keeps working without knowing this table exists.
   */
  async makePrimary(sourceId: string, mirrorId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(watchSourceDomains)
        .where(
          and(
            eq(watchSourceDomains.id, mirrorId),
            eq(watchSourceDomains.watchSourceId, sourceId),
          ),
        )
        .limit(1);

      const target = rows[0];
      if (!target) return false;

      await tx
        .update(watchSourceDomains)
        .set({ isPrimary: false })
        .where(eq(watchSourceDomains.watchSourceId, sourceId));

      await tx
        .update(watchSourceDomains)
        .set({ isPrimary: true, isConfirmed: true })
        .where(eq(watchSourceDomains.id, mirrorId));

      await tx
        .update(watchSources)
        .set({
          domain: target.domain,
          homepageUrl: target.homepageUrl,
          // The address changed, so what we knew about the old one no longer
          // describes this listing. The next check starts clean rather than
          // carrying failures from a domain nobody uses any more.
          healthStatus: null,
          healthStatusCode: null,
          healthFailures: 0,
          healthDetail: null,
          lastHealthCheckAt: null,
          updatedAt: new Date(),
        })
        .where(eq(watchSources.id, sourceId));

      return true;
    });
  }

  /** Accepts a mirror the checker proposed. */
  async confirm(sourceId: string, mirrorId: string): Promise<boolean> {
    const rows = await this.db
      .update(watchSourceDomains)
      .set({ isConfirmed: true })
      .where(
        and(eq(watchSourceDomains.id, mirrorId), eq(watchSourceDomains.watchSourceId, sourceId)),
      )
      .returning({ id: watchSourceDomains.id });
    return rows.length > 0;
  }

  /** Removes an address. The primary one cannot be removed, only replaced. */
  async remove(sourceId: string, mirrorId: string): Promise<boolean> {
    const rows = await this.db
      .delete(watchSourceDomains)
      .where(
        and(
          eq(watchSourceDomains.id, mirrorId),
          eq(watchSourceDomains.watchSourceId, sourceId),
          eq(watchSourceDomains.isPrimary, false),
        ),
      )
      .returning({ id: watchSourceDomains.id });
    return rows.length > 0;
  }

  /**
   * Makes sure a listing's own address is recorded here.
   *
   * Called when a listing is created, so code that reads mirrors never has to
   * special-case a listing that has none.
   */
  async ensurePrimary(sourceId: string, domain: string, homepageUrl: string): Promise<void> {
    await this.db
      .insert(watchSourceDomains)
      .values({ watchSourceId: sourceId, domain, homepageUrl, isPrimary: true, isConfirmed: true })
      .onConflictDoNothing({ target: watchSourceDomains.domain });
  }

  /** Proposed mirrors across the whole directory, for the review queue. */
  async proposed(limit = 50): Promise<
    Array<{ mirror: Mirror; sourceId: string; sourceName: string; sourceDomain: string }>
  > {
    const rows = await this.db
      .select({
        id: watchSourceDomains.id,
        domain: watchSourceDomains.domain,
        homepageUrl: watchSourceDomains.homepageUrl,
        isPrimary: watchSourceDomains.isPrimary,
        isConfirmed: watchSourceDomains.isConfirmed,
        note: watchSourceDomains.note,
        createdAt: watchSourceDomains.createdAt,
        sourceId: watchSources.id,
        sourceName: watchSources.name,
        sourceDomain: watchSources.domain,
      })
      .from(watchSourceDomains)
      .innerJoin(watchSources, eq(watchSources.id, watchSourceDomains.watchSourceId))
      .where(
        and(
          eq(watchSourceDomains.isConfirmed, false),
          sql`${watchSources.deletedAt} is null`,
        ),
      )
      .orderBy(desc(watchSourceDomains.createdAt))
      .limit(limit);

    return rows.map(({ sourceId, sourceName, sourceDomain, ...mirror }) => ({
      mirror,
      sourceId,
      sourceName,
      sourceDomain,
    }));
  }
}
