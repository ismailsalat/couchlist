import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { isUniqueViolation } from './errors.js';
import {
  sourceCollectionItems,
  sourceCollections,
  users,
  watchSources,
  type SourceCollectionRow,
} from '../schema.js';

/**
 * Source collections.
 *
 * Every read takes a viewer. A private collection is returned only to its
 * owner: the check is in the query, so a guessed id does not expose one.
 */

export interface CollectionWithCount extends SourceCollectionRow {
  itemCount: number;
}

export class CollectionRepository {
  constructor(private readonly db: Database) {}

  /** URL-safe slug, uniquified per owner by the caller's retry. */
  static slugify(name: string): string {
    const base = name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 60);
    return base || 'collection';
  }

  async create(input: {
    ownerUserId: string;
    name: string;
    description?: string | null;
    isPublic: boolean;
  }): Promise<SourceCollectionRow> {
    const base = CollectionRepository.slugify(input.name);

    // A person may well have two collections with similar names; suffix rather
    // than reject.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      try {
        const rows = await this.db
          .insert(sourceCollections)
          .values({
            ownerUserId: input.ownerUserId,
            name: input.name,
            slug,
            description: input.description ?? null,
            isPublic: input.isPublic,
          })
          .returning();
        return rows[0]!;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error('Could not find a free name for that collection.');
  }

  async update(
    collectionId: string,
    ownerUserId: string,
    patch: { name?: string; description?: string | null; isPublic?: boolean },
  ): Promise<SourceCollectionRow | undefined> {
    const rows = await this.db
      .update(sourceCollections)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(eq(sourceCollections.id, collectionId), eq(sourceCollections.ownerUserId, ownerUserId)),
      )
      .returning();
    return rows[0];
  }

  async remove(collectionId: string, ownerUserId: string): Promise<boolean> {
    const rows = await this.db
      .delete(sourceCollections)
      .where(
        and(eq(sourceCollections.id, collectionId), eq(sourceCollections.ownerUserId, ownerUserId)),
      )
      .returning({ id: sourceCollections.id });
    return rows.length > 0;
  }

  async listOwned(ownerUserId: string): Promise<CollectionWithCount[]> {
    const itemCount = sql<number>`(
      select count(*)::int from ${sourceCollectionItems}
      where ${sourceCollectionItems.collectionId} = ${sourceCollections.id}
    )`;
    const rows = await this.db
      .select({ collection: sourceCollections, itemCount })
      .from(sourceCollections)
      .where(eq(sourceCollections.ownerUserId, ownerUserId))
      .orderBy(desc(sourceCollections.updatedAt));
    return rows.map((row) => ({ ...row.collection, itemCount: row.itemCount }));
  }

  /** Public collections, for browsing. Never includes a private one. */
  async listPublic(limit = 20): Promise<Array<CollectionWithCount & { ownerDisplayName: string | null }>> {
    const itemCount = sql<number>`(
      select count(*)::int from ${sourceCollectionItems}
      where ${sourceCollectionItems.collectionId} = ${sourceCollections.id}
    )`;
    const rows = await this.db
      .select({ collection: sourceCollections, itemCount, ownerDisplayName: users.displayName })
      .from(sourceCollections)
      .leftJoin(users, eq(users.id, sourceCollections.ownerUserId))
      .where(eq(sourceCollections.isPublic, true))
      .orderBy(desc(sourceCollections.updatedAt))
      .limit(limit);
    return rows.map((row) => ({
      ...row.collection,
      itemCount: row.itemCount,
      ownerDisplayName: row.ownerDisplayName,
    }));
  }

  /**
   * One collection, if this viewer may see it.
   *
   * `viewerUserId` may be undefined for an anonymous visitor, in which case
   * only a public collection is returned.
   */
  async findForViewer(
    ownerUserId: string,
    slug: string,
    viewerUserId?: string,
  ): Promise<SourceCollectionRow | undefined> {
    const rows = await this.db
      .select()
      .from(sourceCollections)
      .where(and(eq(sourceCollections.ownerUserId, ownerUserId), eq(sourceCollections.slug, slug)))
      .limit(1);

    const collection = rows[0];
    if (!collection) return undefined;
    if (!collection.isPublic && collection.ownerUserId !== viewerUserId) return undefined;
    return collection;
  }

  async items(collectionId: string) {
    return this.db
      .select({
        item: sourceCollectionItems,
        source: watchSources,
      })
      .from(sourceCollectionItems)
      .innerJoin(watchSources, eq(watchSources.id, sourceCollectionItems.sourceId))
      .where(eq(sourceCollectionItems.collectionId, collectionId))
      .orderBy(asc(sourceCollectionItems.position), asc(sourceCollectionItems.createdAt));
  }

  async addItem(
    collectionId: string,
    ownerUserId: string,
    sourceId: string,
    note?: string | null,
  ): Promise<boolean> {
    // Ownership is checked before the insert, so a guessed collection id
    // cannot be written to.
    const owned = await this.db
      .select({ id: sourceCollections.id })
      .from(sourceCollections)
      .where(
        and(eq(sourceCollections.id, collectionId), eq(sourceCollections.ownerUserId, ownerUserId)),
      )
      .limit(1);
    if (!owned[0]) return false;

    const nextPosition = await this.db
      .select({ next: sql<number>`coalesce(max(${sourceCollectionItems.position}), -1) + 1` })
      .from(sourceCollectionItems)
      .where(eq(sourceCollectionItems.collectionId, collectionId));

    await this.db
      .insert(sourceCollectionItems)
      .values({
        collectionId,
        sourceId,
        note: note ?? null,
        position: nextPosition[0]?.next ?? 0,
      })
      .onConflictDoUpdate({
        target: [sourceCollectionItems.collectionId, sourceCollectionItems.sourceId],
        set: { note: note ?? null },
      });

    await this.db
      .update(sourceCollections)
      .set({ updatedAt: new Date() })
      .where(eq(sourceCollections.id, collectionId));
    return true;
  }

  async removeItem(collectionId: string, ownerUserId: string, sourceId: string): Promise<boolean> {
    const owned = await this.db
      .select({ id: sourceCollections.id })
      .from(sourceCollections)
      .where(
        and(eq(sourceCollections.id, collectionId), eq(sourceCollections.ownerUserId, ownerUserId)),
      )
      .limit(1);
    if (!owned[0]) return false;

    const rows = await this.db
      .delete(sourceCollectionItems)
      .where(
        and(
          eq(sourceCollectionItems.collectionId, collectionId),
          eq(sourceCollectionItems.sourceId, sourceId),
        ),
      )
      .returning({ id: sourceCollectionItems.id });
    return rows.length > 0;
  }
}

