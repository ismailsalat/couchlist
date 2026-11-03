import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  CreditMode,
  flagsFromCategories,
  publicCredit,
  type ContributionKind,
  type PublicCredit,
  type SourceCategory,
} from '@couchlist/shared';
import type { Database } from '../client.js';
import { isUniqueViolation } from './errors.js';
import { IconRepository } from './icons.js';
import {
  sourceContributions,
  sourceRevisions,
  users,
  watchSourceCandidates,
  watchSourceReports,
  watchSourceDomains,
  watchSources,
  type SourceContributionRow,
  type WatchSourceCandidateRow,
  type WatchSourceRow,
} from '../schema.js';

/**
 * Suggestions, corrections, reports and credit.
 *
 * Two rules are enforced here rather than being left to callers:
 *
 *  1. Approving a suggestion publishes the source and writes its credit in one
 *     transaction. A failure cannot leave a half-approved entry behind.
 *  2. Public credit is built only through `publicCredit`, so an anonymous
 *     contribution never carries a name, an avatar or an account id.
 */

export interface SuggestSourceRecord {
  domain: string;
  name: string;
  homepageUrl: string;
  description?: string | null;
  categories: SourceCategory[];
  explanation?: string | null;
  submittedByUserId: string;
  creditMode: CreditMode;
}

export interface SuggestCorrectionRecord {
  targetSourceId: string;
  domain: string;
  submittedByUserId: string;
  creditMode: CreditMode;
  explanation?: string | null;
  proposedName?: string;
  proposedUrl?: string;
  proposedDescription?: string;
  proposedCategories?: SourceCategory[];
  proposedHasLotsOfAds?: boolean;
}

export type DuplicateReason = 'already_listed' | 'pending_suggestion';

export type SuggestOutcome =
  | { ok: true; candidate: WatchSourceCandidateRow; updatedExisting?: boolean }
  | { ok: false; reason: DuplicateReason; existingSourceId?: string };

/** A credited contribution as a public response may describe it. */
export interface PublicContribution {
  id: string;
  kind: ContributionKind;
  isOriginal: boolean;
  summary: string | null;
  createdAt: Date;
  credit: PublicCredit;
}

export class ContributionRepository {
  constructor(private readonly db: Database) {}

  /* ---------------------------- suggestions ---------------------------- */

  /**
   * Records a new-source suggestion.
   *
   * Duplicates are rejected on the normalised domain: an existing listing, or
   * an existing pending suggestion. The partial unique index is the real
   * guarantee, so two concurrent submissions cannot both be accepted.
   */
  async suggestSource(input: SuggestSourceRecord): Promise<SuggestOutcome> {
    const existing = await this.db
      .select({ id: watchSources.id })
      .from(watchSources)
      .where(eq(watchSources.domain, input.domain))
      .limit(1);
    if (existing[0]) {
      return { ok: false, reason: 'already_listed', existingSourceId: existing[0].id };
    }

    const flags = flagsFromCategories(input.categories);
    const values = {
      domain: input.domain,
      suggestedName: input.name,
      homepageUrl: input.homepageUrl,
      description: input.description ?? null,
      comment: input.explanation ?? null,
      submittedByUserId: input.submittedByUserId,
      creditMode: input.creditMode,
      kind: 'NEW_SOURCE' as const,
      origin: 'COMMUNITY' as const,
      supportsAnime: flags.supportsAnime,
      supportsMovies: flags.supportsMovies,
      supportsTv: flags.supportsTv,
      supportsManga: flags.supportsManga,
      supportsManhwa: flags.supportsManhwa,
      supportsComics: flags.supportsComics,
    };

    /*
     * Several people may suggest the same website, and all of them are kept.
     * The admin queue groups them into one decision and everyone is credited,
     * so a second submitter is a signal rather than a nuisance.
     *
     * The one thing not kept is the *same* person submitting twice while it is
     * pending: that updates their existing entry instead of stacking copies.
     * A unique index makes it so, which is why this catches rather than
     * read-then-writes.
     */
    try {
      const rows = await this.db.insert(watchSourceCandidates).values(values).returning();
      return { ok: true, candidate: rows[0]! };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      const updated = await this.db
        .update(watchSourceCandidates)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(
            eq(watchSourceCandidates.domain, input.domain),
            eq(watchSourceCandidates.submittedByUserId, input.submittedByUserId),
            eq(watchSourceCandidates.status, 'PENDING'),
            eq(watchSourceCandidates.kind, 'NEW_SOURCE'),
          ),
        )
        .returning();

      if (updated[0]) return { ok: true, candidate: updated[0], updatedExisting: true };
      return { ok: false, reason: 'pending_suggestion' };
    }
  }

  /**
   * Pending new-source suggestions, grouped by the website they are about.
   *
   * One group is one decision for a moderator, however many people suggested
   * it. Each group carries every submission so the best write-up can be
   * chosen, and every submitter can be credited.
   */
  async pendingSuggestionGroups(): Promise<
    Array<{
      domain: string;
      submissions: Array<
        WatchSourceCandidateRow & {
          submitterName: string | null;
          hasIcon: boolean;
        }
      >;
    }>
  > {
    const rows = await this.db
      .select({
        candidate: watchSourceCandidates,
        submitterName: users.displayName,
        submitterUsername: users.username,
      })
      .from(watchSourceCandidates)
      .leftJoin(users, eq(users.id, watchSourceCandidates.submittedByUserId))
      .where(
        and(
          eq(watchSourceCandidates.status, 'PENDING'),
          eq(watchSourceCandidates.kind, 'NEW_SOURCE'),
        ),
      )
      .orderBy(asc(watchSourceCandidates.createdAt));

    const grouped = new Map<string, Array<(typeof rows)[number]>>();
    for (const row of rows) {
      const key = row.candidate.domain;
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }

    return [...grouped.entries()]
      .map(([domain, entries]) => ({
        domain,
        submissions: entries.map((entry) => ({
          ...entry.candidate,
          submitterName: entry.submitterName?.trim() || entry.submitterUsername || null,
          hasIcon: entry.candidate.iconMime !== null,
        })),
      }))
      // Most-suggested first: several people asking for the same site is the
      // strongest signal in the queue.
      .sort((a, b) => b.submissions.length - a.submissions.length);
  }

  async suggestCorrection(input: SuggestCorrectionRecord): Promise<WatchSourceCandidateRow> {
    const source = await this.db
      .select()
      .from(watchSources)
      .where(eq(watchSources.id, input.targetSourceId))
      .limit(1);
    if (!source[0]) throw new Error('Unknown source.');

    const rows = await this.db
      .insert(watchSourceCandidates)
      .values({
        kind: 'CORRECTION',
        targetSourceId: input.targetSourceId,
        // A correction is about an existing listing, so it inherits its
        // identity rather than claiming a new domain.
        domain: input.domain,
        suggestedName: source[0].name,
        homepageUrl: source[0].homepageUrl,
        submittedByUserId: input.submittedByUserId,
        creditMode: input.creditMode,
        comment: input.explanation ?? null,
        origin: 'COMMUNITY',
        proposedName: input.proposedName ?? null,
        proposedUrl: input.proposedUrl ?? null,
        proposedDescription: input.proposedDescription ?? null,
        proposedCategories: input.proposedCategories ?? null,
        proposedHasLotsOfAds: input.proposedHasLotsOfAds ?? null,
      })
      .returning();
    return rows[0]!;
  }

  async pendingCandidates(): Promise<WatchSourceCandidateRow[]> {
    return this.db
      .select()
      .from(watchSourceCandidates)
      .where(eq(watchSourceCandidates.status, 'PENDING'))
      .orderBy(desc(watchSourceCandidates.createdAt));
  }

  async pendingCandidateCount(): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(watchSourceCandidates)
      .where(eq(watchSourceCandidates.status, 'PENDING'));
    return rows[0]?.count ?? 0;
  }

  async findCandidateById(id: string): Promise<WatchSourceCandidateRow | undefined> {
    const rows = await this.db
      .select()
      .from(watchSourceCandidates)
      .where(eq(watchSourceCandidates.id, id))
      .limit(1);
    return rows[0];
  }

  /** One person's submissions, with status, for My submissions. */
  async candidatesByUser(userId: string): Promise<WatchSourceCandidateRow[]> {
    return this.db
      .select()
      .from(watchSourceCandidates)
      .where(eq(watchSourceCandidates.submittedByUserId, userId))
      .orderBy(desc(watchSourceCandidates.createdAt));
  }

  /* ------------------------------ approval ----------------------------- */

  /**
   * Approves a new-source suggestion into a visible listing.
   *
   * One transaction covers creating the source, recording original credit,
   * and marking the candidate approved. An approved source is immediately
   * public: `isEnabled` is set here, so there is no second hidden enable step.
   */
  async approveNewSource(
    candidateId: string,
    reviewerUserId: string,
    edits: {
      name?: string;
      homepageUrl?: string;
      domain?: string;
      description?: string;
      categories?: SourceCategory[];
      hasLotsOfAds?: boolean;
    } = {},
    reviewNotes?: string,
  ): Promise<{
    source: WatchSourceRow;
    contribution: SourceContributionRow;
    creditedCount: number;
  }> {
    return this.db.transaction(async (tx) => {
      const candidateRows = await tx
        .select()
        .from(watchSourceCandidates)
        .where(and(eq(watchSourceCandidates.id, candidateId), eq(watchSourceCandidates.status, 'PENDING')))
        .limit(1);

      const chosen = candidateRows[0];
      if (!chosen) throw new Error('That suggestion is no longer pending.');

      /*
       * Everyone who suggested this website, not just whoever wrote the entry
       * the moderator picked. Several people spotting the same gap is work by
       * all of them, so all of them are credited.
       *
       * Ordered oldest first: the earliest submitter becomes the original
       * contributor, which is the one credit the database allows per source.
       */
      const siblings = await tx
        .select()
        .from(watchSourceCandidates)
        .where(
          and(
            eq(watchSourceCandidates.domain, chosen.domain),
            eq(watchSourceCandidates.status, 'PENDING'),
            eq(watchSourceCandidates.kind, 'NEW_SOURCE'),
          ),
        )
        .orderBy(asc(watchSourceCandidates.createdAt));

      const group = siblings.length > 0 ? siblings : [chosen];

      const categories =
        edits.categories ??
        ([
          chosen.supportsAnime && 'Anime',
          chosen.supportsMovies && 'Movies',
          chosen.supportsTv && 'TV',
          chosen.supportsManga && 'Manga',
          chosen.supportsManhwa && 'Manhwa',
          chosen.supportsComics && 'Comics',
        ].filter(Boolean) as SourceCategory[]);
      const flags = flagsFromCategories(categories);

      const sourceRows = await tx
        .insert(watchSources)
        .values({
          name: edits.name ?? chosen.suggestedName,
          domain: edits.domain ?? chosen.domain,
          homepageUrl: edits.homepageUrl ?? chosen.homepageUrl,
          description: edits.description ?? chosen.description,
          hasLotsOfAds: edits.hasLotsOfAds ?? false,
          sourceType: 'COMMUNITY',
          origin: 'COMMUNITY',
          // Visible the moment it is approved.
          isEnabled: true,
          isVerified: false,
          ...flags,
        })
        .returning();

      const source = sourceRows[0];
      if (!source) throw new Error('Could not create the source.');

      // Its address, recorded where the mirrors live, so a site that later
      // moves can keep this listing rather than needing a new one.
      await tx
        .insert(watchSourceDomains)
        .values({
          watchSourceId: source.id,
          domain: source.domain,
          homepageUrl: source.homepageUrl,
          isPrimary: true,
          isConfirmed: true,
        })
        .onConflictDoNothing({ target: watchSourceDomains.domain });

      /*
       * The icon comes from whichever submission the moderator picked. If that
       * one has none, the earliest submission that does is used instead, so a
       * good icon is not thrown away because a different write-up won.
       */
      let iconMoved = await IconRepository.promoteCandidateIcon(tx, chosen.id, source.id);
      if (!iconMoved) {
        for (const sibling of group) {
          if (sibling.id === chosen.id || !sibling.iconMime) continue;
          iconMoved = await IconRepository.promoteCandidateIcon(tx, sibling.id, source.id);
          if (iconMoved) break;
        }
      }

      // Oldest submitter is the original contributor; the rest are credited
      // alongside, each keeping their own public-credit choice.
      const credits: SourceContributionRow[] = [];
      for (const [index, submission] of group.entries()) {
        const rows = await tx
          .insert(sourceContributions)
          .values({
            sourceId: source.id,
            userId: submission.submittedByUserId,
            kind: 'NEW_SOURCE',
            creditMode: submission.creditMode,
            isOriginal: index === 0,
            summary:
              index === 0 ? 'Suggested this source' : 'Also suggested this source',
            candidateId: submission.id,
          })
          .returning();
        if (rows[0]) credits.push(rows[0]);
      }

      await tx
        .update(watchSourceCandidates)
        .set({
          status: 'APPROVED',
          reviewedByUserId: reviewerUserId,
          reviewedAt: new Date(),
          reviewNotes: reviewNotes ?? null,
          promotedSourceId: source.id,
          updatedAt: new Date(),
        })
        .where(
          inArray(
            watchSourceCandidates.id,
            group.map((submission) => submission.id),
          ),
        );

      const original = credits.find((credit) => credit.isOriginal) ?? credits[0]!;
      return { source, contribution: original, creditedCount: credits.length };
    });
  }

  /**
   * Applies an approved correction.
   *
   * The correction's credit is a separate row, so the original contributor's
   * credit is never replaced. The revision records what actually changed.
   */
  async approveCorrection(
    candidateId: string,
    reviewerUserId: string,
    reviewNotes?: string,
  ): Promise<{ source: WatchSourceRow; changed: string[] }> {
    return this.db.transaction(async (tx) => {
      const candidateRows = await tx
        .select()
        .from(watchSourceCandidates)
        .where(and(eq(watchSourceCandidates.id, candidateId), eq(watchSourceCandidates.status, 'PENDING')))
        .limit(1);
      const candidate = candidateRows[0];
      if (!candidate || !candidate.targetSourceId) {
        throw new Error('That correction is no longer pending.');
      }

      const existingRows = await tx
        .select()
        .from(watchSources)
        .where(eq(watchSources.id, candidate.targetSourceId))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) throw new Error('The corrected source no longer exists.');

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      const changed: string[] = [];

      if (candidate.proposedName && candidate.proposedName !== existing.name) {
        patch.name = candidate.proposedName;
        changed.push('name');
      }
      if (candidate.proposedUrl && candidate.proposedUrl !== existing.homepageUrl) {
        patch.homepageUrl = candidate.proposedUrl;
        changed.push('url');
      }
      if (
        candidate.proposedDescription &&
        candidate.proposedDescription !== existing.description
      ) {
        patch.description = candidate.proposedDescription;
        changed.push('description');
      }
      if (Array.isArray(candidate.proposedCategories)) {
        const flags = flagsFromCategories(candidate.proposedCategories as SourceCategory[]);
        Object.assign(patch, flags);
        changed.push('categories');
      }
      if (
        candidate.proposedHasLotsOfAds !== null &&
        candidate.proposedHasLotsOfAds !== existing.hasLotsOfAds
      ) {
        patch.hasLotsOfAds = candidate.proposedHasLotsOfAds;
        changed.push('ad warning');
      }

      const updatedRows =
        changed.length > 0
          ? await tx
              .update(watchSources)
              .set(patch)
              .where(eq(watchSources.id, existing.id))
              .returning()
          : [existing];

      // Only a change that altered something earns credit and a revision.
      if (changed.length > 0) {
        const contributionRows = await tx
          .insert(sourceContributions)
          .values({
            sourceId: existing.id,
            userId: candidate.submittedByUserId,
            kind: 'CORRECTION',
            creditMode: candidate.creditMode,
            isOriginal: false,
            summary: `Corrected ${changed.join(', ')}`,
          })
          .returning();

        await tx.insert(sourceRevisions).values({
          sourceId: existing.id,
          contributionId: contributionRows[0]?.id ?? null,
          summary: `Corrected ${changed.join(', ')}`,
          changedFields: changed,
          appliedByUserId: reviewerUserId,
        });
      }

      await tx
        .update(watchSourceCandidates)
        .set({
          status: 'APPROVED',
          reviewedByUserId: reviewerUserId,
          reviewedAt: new Date(),
          reviewNotes: reviewNotes ?? null,
          promotedSourceId: existing.id,
          updatedAt: new Date(),
        })
        .where(eq(watchSourceCandidates.id, candidate.id));

      return { source: updatedRows[0] ?? existing, changed };
    });
  }

  /** Rejects a suggestion. A rejected entry earns no credit. */
  async rejectCandidate(
    candidateId: string,
    reviewerUserId: string,
    reviewNotes?: string,
  ): Promise<void> {
    await this.db
      .update(watchSourceCandidates)
      .set({
        status: 'REJECTED',
        reviewedByUserId: reviewerUserId,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(watchSourceCandidates.id, candidateId), eq(watchSourceCandidates.status, 'PENDING')));
  }

  /* ------------------------------- credit ------------------------------ */

  /**
   * Public credit for a source.
   *
   * The account join happens here, but only `publicCredit` decides what comes
   * out, and for an anonymous row that is a name with no id and no avatar.
   */
  async publicContributions(sourceId: string): Promise<PublicContribution[]> {
    const rows = await this.db
      .select({
        contribution: sourceContributions,
        user: {
          id: users.id,
          displayName: users.displayName,
          username: users.username,
          avatarUrl: users.avatarUrl,
          avatarMime: users.avatarMime,
          deletedAt: users.deletedAt,
        },
      })
      .from(sourceContributions)
      .leftJoin(users, eq(users.id, sourceContributions.userId))
      .where(eq(sourceContributions.sourceId, sourceId))
      .orderBy(desc(sourceContributions.isOriginal), desc(sourceContributions.createdAt));

    return rows.map((row) => ({
      id: row.contribution.id,
      kind: row.contribution.kind,
      isOriginal: row.contribution.isOriginal,
      summary: row.contribution.summary,
      createdAt: row.contribution.createdAt,
      credit: publicCredit({
        creditMode: row.contribution.creditMode,
        user: row.user?.id ? row.user : null,
      }),
    }));
  }

  /**
   * A person's own contributions, for their profile.
   *
   * Only credited ones: a public profile shows what its owner chose to make
   * public, so an anonymous contribution does not appear in a feed that is
   * itself attributable.
   */
  async publicProfileContributions(userId: string, limit = 25): Promise<PublicContribution[]> {
    const rows = await this.db
      .select({ contribution: sourceContributions, sourceName: watchSources.name })
      .from(sourceContributions)
      .leftJoin(watchSources, eq(watchSources.id, sourceContributions.sourceId))
      .where(
        and(
          eq(sourceContributions.userId, userId),
          eq(sourceContributions.creditMode, CreditMode.CREDITED),
        ),
      )
      .orderBy(desc(sourceContributions.createdAt))
      .limit(limit);

    const user = await this.db
      .select({
        id: users.id,
        displayName: users.displayName,
        username: users.username,
        avatarUrl: users.avatarUrl,
        avatarMime: users.avatarMime,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return rows.map((row) => ({
      id: row.contribution.id,
      kind: row.contribution.kind,
      isOriginal: row.contribution.isOriginal,
      summary: row.sourceName ? `${row.contribution.summary} — ${row.sourceName}` : row.contribution.summary,
      createdAt: row.contribution.createdAt,
      credit: publicCredit({ creditMode: CreditMode.CREDITED, user: user[0] ?? null }),
    }));
  }

  /**
   * Public contribution count.
   *
   * Approved and credited only, so the number neither counts spam nor reveals
   * that an anonymous history exists.
   */
  /**
   * What somebody's account actually amounts to.
   *
   * The number that matters is the last one. "You found four sources" is a
   * fact about them; "nine hundred people saved something you found" is the
   * thing that makes having an account feel like it was worth something, and
   * it is true without being flattery.
   *
   * Only credited contributions count. Anything submitted anonymously stays
   * out, or a profile page would quietly identify the person who asked not to
   * be identified.
   */
  async profileTotals(userId: string): Promise<{
    sourcesFound: number;
    correctionsAccepted: number;
    guidesWritten: number;
    savesOfTheirFinds: number;
    votesOnTheirFinds: number;
    hasTrustedFind: boolean;
    firstContributionAt: Date | null;
  }> {
    const { rows } = await this.db.execute(sql`
      with mine as (
        select distinct source_id, kind, created_at
        from source_contributions
        where user_id = ${userId} and credit_mode = 'CREDITED'
      ),
      found as (select distinct source_id from mine where kind = 'NEW_SOURCE')
      select
        (select count(*)::int from mine where kind = 'NEW_SOURCE') as sources_found,
        (select count(*)::int from mine where kind = 'CORRECTION') as corrections,
        (select count(*)::int from mine where kind in ('GUIDE', 'GUIDE_CORRECTION')) as guides,
        (select count(*)::int from source_bookmarks b
           join found f on f.source_id = b.source_id) as saves,
        (select count(*)::int from source_votes v
           join found f on f.source_id = v.source_id
          where v.value = 'LIKE') as likes,
        (select exists(
           select 1 from watch_sources s
            join found f on f.source_id = s.id
           where s.trusted_rank is not null and s.deleted_at is null
         )) as has_trusted,
        (select min(created_at) from mine) as first_at
    `);

    const row = (rows[0] ?? {}) as Record<string, unknown>;
    return {
      sourcesFound: Number(row.sources_found ?? 0),
      correctionsAccepted: Number(row.corrections ?? 0),
      guidesWritten: Number(row.guides ?? 0),
      savesOfTheirFinds: Number(row.saves ?? 0),
      votesOnTheirFinds: Number(row.likes ?? 0),
      hasTrustedFind: row.has_trusted === true,
      firstContributionAt: row.first_at ? new Date(String(row.first_at)) : null,
    };
  }

  async publicContributionCount(userId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(sourceContributions)
      .where(
        and(
          eq(sourceContributions.userId, userId),
          eq(sourceContributions.creditMode, CreditMode.CREDITED),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  /** Lets a contributor change their mind about public credit. */
  async setCreditMode(
    contributionId: string,
    userId: string,
    creditMode: CreditMode,
  ): Promise<boolean> {
    const rows = await this.db
      .update(sourceContributions)
      .set({ creditMode, updatedAt: new Date() })
      .where(and(eq(sourceContributions.id, contributionId), eq(sourceContributions.userId, userId)))
      .returning({ id: sourceContributions.id });
    return rows.length > 0;
  }

  async ownContributions(userId: string): Promise<SourceContributionRow[]> {
    return this.db
      .select()
      .from(sourceContributions)
      .where(eq(sourceContributions.userId, userId))
      .orderBy(desc(sourceContributions.createdAt));
  }

  async revisions(sourceId: string, limit = 10) {
    return this.db
      .select()
      .from(sourceRevisions)
      .where(eq(sourceRevisions.sourceId, sourceId))
      .orderBy(desc(sourceRevisions.createdAt))
      .limit(limit);
  }

  /* ------------------------------ reports ------------------------------ */

  /**
   * Files a report against a source.
   *
   * The partial unique index means one person cannot pile up open reports for
   * the same source, so the admin queue reflects distinct complaints.
   */
  async reportSource(input: {
    sourceId: string;
    reportedByUserId: string;
    reason: 'BROKEN_LINK' | 'LOTS_OF_ADS' | 'OTHER';
    details?: string | null;
  }): Promise<{ ok: boolean; duplicate?: boolean }> {
    try {
      await this.db.insert(watchSourceReports).values({
        watchSourceId: input.sourceId,
        reportedByUserId: input.reportedByUserId,
        reason: input.reason,
        details: input.details ?? null,
      });
      return { ok: true };
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: true, duplicate: true };
      throw error;
    }
  }

  /**
   * Open reports grouped by source.
   *
   * Grouped so that twenty reports about one broken link are one piece of work
   * in the queue instead of twenty.
   */
  async openReportGroups(): Promise<
    Array<{
      source: WatchSourceRow;
      count: number;
      reasons: Array<{ reason: string; count: number }>;
      latestAt: Date;
      samples: Array<{ reason: string; details: string | null; createdAt: Date }>;
    }>
  > {
    const rows = await this.db
      .select({ report: watchSourceReports, source: watchSources })
      .from(watchSourceReports)
      .innerJoin(watchSources, eq(watchSources.id, watchSourceReports.watchSourceId))
      .where(isNull(watchSourceReports.resolvedAt))
      .orderBy(desc(watchSourceReports.createdAt));

    const grouped = new Map<
      string,
      {
        source: WatchSourceRow;
        count: number;
        reasons: Map<string, number>;
        latestAt: Date;
        samples: Array<{ reason: string; details: string | null; createdAt: Date }>;
      }
    >();

    for (const row of rows) {
      const key = row.source.id;
      const entry =
        grouped.get(key) ??
        {
          source: row.source,
          count: 0,
          reasons: new Map<string, number>(),
          latestAt: row.report.createdAt,
          samples: [],
        };
      entry.count += 1;
      entry.reasons.set(row.report.reason, (entry.reasons.get(row.report.reason) ?? 0) + 1);
      if (row.report.createdAt > entry.latestAt) entry.latestAt = row.report.createdAt;
      if (entry.samples.length < 3 && row.report.details) {
        entry.samples.push({
          reason: row.report.reason,
          details: row.report.details,
          createdAt: row.report.createdAt,
        });
      }
      grouped.set(key, entry);
    }

    return [...grouped.values()]
      .map((entry) => ({
        source: entry.source,
        count: entry.count,
        reasons: [...entry.reasons.entries()].map(([reason, count]) => ({ reason, count })),
        latestAt: entry.latestAt,
        samples: entry.samples,
      }))
      .sort((a, b) => b.count - a.count || b.latestAt.getTime() - a.latestAt.getTime());
  }

  /** Resolves or dismisses every open report for one source, as a group. */
  async resolveReportsForSource(
    sourceId: string,
    reviewerUserId: string,
    resolutionNote?: string,
  ): Promise<number> {
    const rows = await this.db
      .update(watchSourceReports)
      .set({
        resolvedAt: new Date(),
        resolvedByUserId: reviewerUserId,
        resolutionNote: resolutionNote ?? null,
      })
      .where(and(eq(watchSourceReports.watchSourceId, sourceId), isNull(watchSourceReports.resolvedAt)))
      .returning({ id: watchSourceReports.id });
    return rows.length;
  }

  async openReportCount(): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(distinct ${watchSourceReports.watchSourceId})::int` })
      .from(watchSourceReports)
      .where(and(isNull(watchSourceReports.resolvedAt), sql`${watchSourceReports.watchSourceId} is not null`));
    return rows[0]?.count ?? 0;
  }

  async reportsByUser(userId: string) {
    return this.db
      .select({ report: watchSourceReports, sourceName: watchSources.name })
      .from(watchSourceReports)
      .leftJoin(watchSources, eq(watchSources.id, watchSourceReports.watchSourceId))
      .where(eq(watchSourceReports.reportedByUserId, userId))
      .orderBy(desc(watchSourceReports.createdAt));
  }

  /** Recently added sources and recently approved corrections, newest first. */
  async recentActivity(limit = 20) {
    const recentSources = await this.db
      .select({ source: watchSources })
      .from(watchSources)
      .where(eq(watchSources.isEnabled, true))
      .orderBy(desc(watchSources.createdAt))
      .limit(limit);

    const recentRevisions = await this.db
      .select({ revision: sourceRevisions, sourceName: watchSources.name, sourceId: watchSources.id })
      .from(sourceRevisions)
      .innerJoin(watchSources, eq(watchSources.id, sourceRevisions.sourceId))
      .where(eq(watchSources.isEnabled, true))
      .orderBy(desc(sourceRevisions.createdAt))
      .limit(limit);

    return { recentSources, recentRevisions };
  }

  async candidatesForSources(sourceIds: string[]): Promise<WatchSourceCandidateRow[]> {
    if (sourceIds.length === 0) return [];
    return this.db
      .select()
      .from(watchSourceCandidates)
      .where(
        and(
          eq(watchSourceCandidates.status, 'PENDING'),
          or(
            inArray(watchSourceCandidates.targetSourceId, sourceIds),
            inArray(watchSourceCandidates.promotedSourceId, sourceIds),
          )!,
        ),
      );
  }
}

