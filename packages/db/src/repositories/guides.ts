import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import {
  GuideDevice,
  guideSupportsDevice,
  normalizeSearchText,
  START_HERE,
  type GuideTopic,
  type GuideTopicFilter,
} from '@couchlist/shared';
import type { Database } from '../client.js';
import { guideSuggestions, guides, type GuideRow, type NewGuide } from '../schema.js';

/**
 * Guides and tools.
 *
 * Steps and links are JSON columns, so a moderator edits content without a
 * deploy. They are read back through `guideSteps`/`guideLinks`, which refuse
 * malformed data instead of letting it reach a template.
 */

export interface GuideLink {
  label: string;
  url: string;
}

export interface GuideQuery {
  topic?: GuideTopicFilter;
  device?: GuideDevice;
  search?: string;
  includeUnpublished?: boolean;
}

/** Steps as a string array, whatever the column happens to hold. */
export function guideSteps(row: Pick<GuideRow, 'steps'>): string[] {
  if (!Array.isArray(row.steps)) return [];
  return row.steps.filter((step): step is string => typeof step === 'string' && step.length > 0);
}

/**
 * Links as label/url pairs.
 *
 * Anything without both fields as strings is dropped rather than rendered: a
 * malformed row must not produce a broken or unsafe anchor.
 */
export function guideLinks(row: Pick<GuideRow, 'links'>): GuideLink[] {
  if (!Array.isArray(row.links)) return [];
  return row.links.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { label, url } = entry as { label?: unknown; url?: unknown };
    if (typeof label !== 'string' || typeof url !== 'string') return [];
    if (!label.trim() || !url.trim()) return [];
    return [{ label, url }];
  });
}

export class GuideRepository {
  constructor(private readonly db: Database) {}

  /**
   * Guides matching a topic, device and search.
   *
   * Topic and device filtering happen in SQL. The text search is applied in
   * memory afterwards because the query must be normalised first ("manwha"
   * finding Manhwa guides), and the guide table is small and fully cached by
   * Postgres: a few hundred rows, not a growing corpus.
   */
  async list(query: GuideQuery = {}): Promise<GuideRow[]> {
    const conditions: SQL[] = [];
    if (!query.includeUnpublished) conditions.push(eq(guides.isPublished, true));

    const topic = query.topic ?? START_HERE;
    const hasSearch = Boolean(normalizeSearchText(query.search ?? ''));

    if (topic !== START_HERE) {
      conditions.push(eq(guides.topic, topic as GuideTopic));
    } else if (!hasSearch) {
      // Start here is a curated selection, but a search should look everywhere.
      conditions.push(eq(guides.isStarter, true));
    }

    const device = query.device ?? GuideDevice.ANY;
    switch (device) {
      case GuideDevice.COMPUTER:
        conditions.push(eq(guides.deviceComputer, true));
        break;
      case GuideDevice.IPHONE:
        conditions.push(eq(guides.deviceIphone, true));
        break;
      case GuideDevice.ANDROID:
        conditions.push(eq(guides.deviceAndroid, true));
        break;
      case GuideDevice.TV:
        conditions.push(eq(guides.deviceTv, true));
        break;
      default:
        break;
    }

    const rows = await this.db
      .select()
      .from(guides)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(guides.sortOrder), asc(sql`lower(${guides.title})`));

    if (!hasSearch) return rows;

    const terms = normalizeSearchText(query.search ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 6);

    return rows.filter((row) => {
      const haystack = normalizeSearchText(
        [row.title, row.task, row.summary, row.keywords, row.note ?? '', row.topic].join(' '),
      );
      return terms.every((term) => haystack.includes(term));
    });
  }

  async findBySlug(slug: string, options: { includeUnpublished?: boolean } = {}): Promise<GuideRow | undefined> {
    const conditions: SQL[] = [eq(guides.slug, slug)];
    if (!options.includeUnpublished) conditions.push(eq(guides.isPublished, true));
    const rows = await this.db.select().from(guides).where(and(...conditions)).limit(1);
    return rows[0];
  }

  async findById(id: string): Promise<GuideRow | undefined> {
    const rows = await this.db.select().from(guides).where(eq(guides.id, id)).limit(1);
    return rows[0];
  }

  async countByTopic(options: { includeUnpublished?: boolean } = {}): Promise<Map<GuideTopic, number>> {
    const rows = await this.db
      .select({ topic: guides.topic, count: sql<number>`count(*)::int` })
      .from(guides)
      .where(options.includeUnpublished ? undefined : eq(guides.isPublished, true))
      .groupBy(guides.topic);
    return new Map(rows.map((row) => [row.topic, row.count]));
  }

  async create(input: NewGuide): Promise<GuideRow> {
    const rows = await this.db.insert(guides).values(input).returning();
    const row = rows[0];
    if (!row) throw new Error('Could not create the guide.');
    return row;
  }

  async update(id: string, patch: Partial<NewGuide>): Promise<GuideRow | undefined> {
    const rows = await this.db
      .update(guides)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(guides.id, id))
      .returning();
    return rows[0];
  }

  /**
   * Records that a human checked this guide's links and claims.
   *
   * Only ever called from an explicit moderator action, so a displayed
   * "last reviewed" date always corresponds to a real review.
   */
  async markReviewed(id: string, reviewerUserId: string): Promise<void> {
    await this.db
      .update(guides)
      .set({ lastReviewedAt: new Date(), lastReviewedByUserId: reviewerUserId, updatedAt: new Date() })
      .where(eq(guides.id, id));
  }

  async listAllForAdmin(): Promise<GuideRow[]> {
    return this.db
      .select()
      .from(guides)
      .orderBy(asc(guides.topic), asc(guides.sortOrder), asc(sql`lower(${guides.title})`));
  }

  /* --------------------------- suggestions ----------------------------- */

  async createSuggestion(input: {
    kind: 'NEW_GUIDE' | 'CORRECTION' | 'BROKEN_LINK';
    targetGuideId?: string | null;
    submittedByUserId: string;
    creditMode: 'CREDITED' | 'ANONYMOUS';
    title?: string | null;
    topic?: GuideTopic | null;
    body: string;
    links?: GuideLink[];
  }) {
    const rows = await this.db
      .insert(guideSuggestions)
      .values({
        kind: input.kind,
        targetGuideId: input.targetGuideId ?? null,
        submittedByUserId: input.submittedByUserId,
        creditMode: input.creditMode,
        title: input.title ?? null,
        topic: input.topic ?? null,
        body: input.body,
        links: input.links ?? [],
      })
      .returning();
    return rows[0]!;
  }

  async pendingSuggestions() {
    return this.db
      .select()
      .from(guideSuggestions)
      .where(eq(guideSuggestions.status, 'PENDING'))
      .orderBy(desc(guideSuggestions.createdAt));
  }

  async suggestionsByUser(userId: string) {
    return this.db
      .select()
      .from(guideSuggestions)
      .where(eq(guideSuggestions.submittedByUserId, userId))
      .orderBy(desc(guideSuggestions.createdAt));
  }

  async findSuggestionById(id: string) {
    const rows = await this.db
      .select()
      .from(guideSuggestions)
      .where(eq(guideSuggestions.id, id))
      .limit(1);
    return rows[0];
  }

  async pendingSuggestionCount(): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(guideSuggestions)
      .where(eq(guideSuggestions.status, 'PENDING'));
    return rows[0]?.count ?? 0;
  }

  /** Re-exported so callers filter with one shared implementation. */
  static supportsDevice = guideSupportsDevice;
}
