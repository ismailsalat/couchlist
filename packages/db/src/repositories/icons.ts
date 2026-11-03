import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  sourceIcons,
  users,
  watchSourceCandidates,
  watchSources,
  type SourceIconRow,
} from '../schema.js';

/**
 * Site icons.
 *
 * The bytes live here; the parent row carries only the MIME type, so listing
 * the directory never loads image data. Writes keep the two in step inside one
 * transaction, because a parent claiming an icon that does not exist would
 * render a broken image on every row.
 */

export interface StoredIcon {
  mime: string;
  bytes: Buffer;
}

export class IconRepository {
  constructor(private readonly db: Database) {}

  /** Attaches an icon to a pending suggestion, replacing any previous one. */
  async setCandidateIcon(
    candidateId: string,
    icon: { mime: string; bytes: Buffer; byteSize: number },
    uploadedByUserId: string | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(sourceIcons).where(eq(sourceIcons.candidateId, candidateId));
      await tx.insert(sourceIcons).values({
        candidateId,
        mime: icon.mime,
        bytes: icon.bytes,
        byteSize: icon.byteSize,
        uploadedByUserId,
      });
      await tx
        .update(watchSourceCandidates)
        .set({ iconMime: icon.mime, updatedAt: new Date() })
        .where(eq(watchSourceCandidates.id, candidateId));
    });
  }

  async setSourceIcon(
    sourceId: string,
    icon: { mime: string; bytes: Buffer; byteSize: number },
    uploadedByUserId: string | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Scoped to the icon. A listing may also hold a preview, and replacing
      // one must never silently remove the other.
      await tx
        .delete(sourceIcons)
        .where(and(eq(sourceIcons.sourceId, sourceId), eq(sourceIcons.kind, 'ICON')));
      await tx.insert(sourceIcons).values({
        sourceId,
        kind: 'ICON',
        mime: icon.mime,
        bytes: icon.bytes,
        byteSize: icon.byteSize,
        uploadedByUserId,
      });
      await tx
        .update(watchSources)
        .set({ iconMime: icon.mime, updatedAt: new Date() })
        .where(eq(watchSources.id, sourceId));
    });
  }

  /**
   * The picture of what a site looks like.
   *
   * Same table, same validation, different `kind`. `sourceNote` records where
   * it came from — the site's own share image, or a moderator's upload — so
   * the listing can say so rather than presenting somebody else's artwork as
   * if we made it.
   */
  async setSourcePreview(
    sourceId: string,
    image: { mime: string; bytes: Buffer; byteSize: number },
    uploadedByUserId: string | null,
    sourceNote: string | null,
    options: { approved?: boolean; capturedFrom?: string | null } = {},
  ): Promise<void> {
    const approved = options.approved ?? true;

    await this.db.transaction(async (tx) => {
      await tx
        .delete(sourceIcons)
        .where(and(eq(sourceIcons.sourceId, sourceId), eq(sourceIcons.kind, 'PREVIEW')));
      await tx.insert(sourceIcons).values({
        sourceId,
        kind: 'PREVIEW',
        sourceNote,
        approved,
        capturedFrom: options.capturedFrom ?? null,
        mime: image.mime,
        bytes: image.bytes,
        byteSize: image.byteSize,
        uploadedByUserId,
      });

      // `previewMime` means "a reader can see a preview". An unapproved
      // capture must not set it, or the queue would be decorative.
      await tx
        .update(watchSources)
        .set({ previewMime: approved ? image.mime : null, updatedAt: new Date() })
        .where(eq(watchSources.id, sourceId));
    });
  }

  /**
   * The preview bytes whatever their state, for the person deciding.
   *
   * Separate from `previewForSource` rather than a flag on it: a flag is one
   * forgotten argument away from serving an unreviewed screenshot to every
   * reader, and this is not the place to be clever.
   */
  async previewForReview(
    sourceId: string,
  ): Promise<{ mime: string; bytes: Buffer; approved: boolean } | undefined> {
    const rows = await this.db
      .select({
        mime: sourceIcons.mime,
        bytes: sourceIcons.bytes,
        approved: sourceIcons.approved,
      })
      .from(sourceIcons)
      .where(and(eq(sourceIcons.sourceId, sourceId), eq(sourceIcons.kind, 'PREVIEW')))
      .limit(1);
    return rows[0];
  }

  /** Counts what is waiting, for the tab that only appears when it should. */
  async pendingPreviewCount(): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(sourceIcons)
      .innerJoin(watchSources, eq(watchSources.id, sourceIcons.sourceId))
      .where(
        and(
          eq(sourceIcons.kind, 'PREVIEW'),
          eq(sourceIcons.approved, false),
          isNull(watchSources.deletedAt),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  /** Accepts a captured screenshot, which is what publishes it. */
  async approvePreview(sourceId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(sourceIcons)
        .set({ approved: true })
        .where(
          and(
            eq(sourceIcons.sourceId, sourceId),
            eq(sourceIcons.kind, 'PREVIEW'),
            eq(sourceIcons.approved, false),
          ),
        )
        .returning({ mime: sourceIcons.mime });

      const row = rows[0];
      if (!row) return false;

      await tx
        .update(watchSources)
        .set({ previewMime: row.mime, updatedAt: new Date() })
        .where(eq(watchSources.id, sourceId));
      return true;
    });
  }

  /** Screenshots waiting for a decision, oldest first. */
  async pendingPreviews(limit = 50): Promise<
    Array<{ sourceId: string; sourceName: string; domain: string; capturedFrom: string | null; createdAt: Date }>
  > {
    const rows = await this.db
      .select({
        sourceId: sourceIcons.sourceId,
        sourceName: watchSources.name,
        domain: watchSources.domain,
        capturedFrom: sourceIcons.capturedFrom,
        createdAt: sourceIcons.createdAt,
      })
      .from(sourceIcons)
      .innerJoin(watchSources, eq(watchSources.id, sourceIcons.sourceId))
      .where(
        and(
          eq(sourceIcons.kind, 'PREVIEW'),
          eq(sourceIcons.approved, false),
          isNull(watchSources.deletedAt),
        ),
      )
      .orderBy(sourceIcons.createdAt)
      .limit(limit);

    return rows.map((row) => ({
      sourceId: String(row.sourceId),
      sourceName: row.sourceName,
      domain: row.domain,
      capturedFrom: row.capturedFrom,
      createdAt: row.createdAt,
    }));
  }

  /** Listings a screenshot would help: no preview, and none waiting. */
  async sourcesWithoutPreview(limit: number): Promise<
    Array<{ id: string; domain: string; homepageUrl: string }>
  > {
    const rows = await this.db
      .select({
        id: watchSources.id,
        domain: watchSources.domain,
        homepageUrl: watchSources.homepageUrl,
      })
      .from(watchSources)
      .where(
        and(
          eq(watchSources.isEnabled, true),
          isNull(watchSources.deletedAt),
          isNull(watchSources.previewMime),
          sql`not exists (
            select 1 from ${sourceIcons} i
            where i.source_id = ${watchSources.id} and i.kind = 'PREVIEW'
          )`,
        ),
      )
      .limit(limit);

    return rows;
  }

  async removeSourcePreview(sourceId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(sourceIcons)
        .where(and(eq(sourceIcons.sourceId, sourceId), eq(sourceIcons.kind, 'PREVIEW')));
      await tx
        .update(watchSources)
        .set({ previewMime: null, updatedAt: new Date() })
        .where(eq(watchSources.id, sourceId));
    });
  }

  /**
   * Where a preview came from, without the bytes.
   *
   * The listing page needs the caption, not a megabyte of image, and reading
   * the row with its `bytes` column would pull the whole picture into the
   * render for the sake of one sentence.
   */
  async previewNoteForSource(sourceId: string): Promise<string | null> {
    const rows = await this.db
      .select({ sourceNote: sourceIcons.sourceNote })
      .from(sourceIcons)
      .where(and(eq(sourceIcons.sourceId, sourceId), eq(sourceIcons.kind, 'PREVIEW')))
      .limit(1);
    return rows[0]?.sourceNote ?? null;
  }

  /** The preview bytes, and where it came from. Public. */
  async previewForSource(
    sourceId: string,
  ): Promise<{ mime: string; bytes: Buffer; sourceNote: string | null } | undefined> {
    const rows = await this.db
      .select({
        mime: sourceIcons.mime,
        bytes: sourceIcons.bytes,
        sourceNote: sourceIcons.sourceNote,
      })
      .from(sourceIcons)
      .where(
        and(
          eq(sourceIcons.sourceId, sourceId),
          eq(sourceIcons.kind, 'PREVIEW'),
          // A capture nobody has looked at is never served to a reader.
          eq(sourceIcons.approved, true),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async removeSourceIcon(sourceId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(sourceIcons)
        .where(and(eq(sourceIcons.sourceId, sourceId), eq(sourceIcons.kind, 'ICON')));
      await tx
        .update(watchSources)
        .set({ iconMime: null, updatedAt: new Date() })
        .where(eq(watchSources.id, sourceId));
    });
  }

  /** The bytes for a listed source. Public: anyone browsing may see it. */
  async forSource(sourceId: string): Promise<StoredIcon | undefined> {
    const rows = await this.db
      .select({ mime: sourceIcons.mime, bytes: sourceIcons.bytes })
      .from(sourceIcons)
      .where(and(eq(sourceIcons.sourceId, sourceId), eq(sourceIcons.kind, 'ICON')))
      .limit(1);
    return rows[0];
  }

  /**
   * An account's profile picture.
   *
   * Stored in the same table, through the same validation, as a site icon:
   * one pipeline for every image a stranger can upload means one place to get
   * the checks right, rather than two places to get them subtly different.
   */
  async setUserAvatar(
    userId: string,
    icon: { mime: string; bytes: Buffer; byteSize: number },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(sourceIcons).where(eq(sourceIcons.userId, userId));
      await tx.insert(sourceIcons).values({
        userId,
        mime: icon.mime,
        bytes: icon.bytes,
        byteSize: icon.byteSize,
        uploadedByUserId: userId,
      });
      await tx
        .update(users)
        .set({ avatarMime: icon.mime, updatedAt: new Date() })
        .where(eq(users.id, userId));
    });
  }

  async removeUserAvatar(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(sourceIcons).where(eq(sourceIcons.userId, userId));
      await tx
        .update(users)
        .set({ avatarMime: null, updatedAt: new Date() })
        .where(eq(users.id, userId));
    });
  }

  async forUser(userId: string): Promise<StoredIcon | undefined> {
    const rows = await this.db
      .select({ mime: sourceIcons.mime, bytes: sourceIcons.bytes })
      .from(sourceIcons)
      .where(eq(sourceIcons.userId, userId))
      .limit(1);
    return rows[0];
  }

  /** The bytes for a pending suggestion. Only ever served to a moderator. */
  async forCandidate(candidateId: string): Promise<StoredIcon | undefined> {
    const rows = await this.db
      .select({ mime: sourceIcons.mime, bytes: sourceIcons.bytes })
      .from(sourceIcons)
      .where(eq(sourceIcons.candidateId, candidateId))
      .limit(1);
    return rows[0];
  }

  /**
   * Carries a suggestion's icon onto the source it became.
   *
   * Called inside the approval transaction. Re-pointing the existing row keeps
   * the uploader's credit and avoids copying the bytes.
   */
  static async promoteCandidateIcon(
    tx: Database,
    candidateId: string,
    sourceId: string,
  ): Promise<boolean> {
    const rows = await tx
      .select({ id: sourceIcons.id, mime: sourceIcons.mime })
      .from(sourceIcons)
      .where(eq(sourceIcons.candidateId, candidateId))
      .limit(1);

    const icon = rows[0];
    if (!icon) return false;

    // The source may already have an icon, and the unique index allows one
    // per kind. Scoped, so a preview on the same listing survives.
    await tx
      .delete(sourceIcons)
      .where(and(eq(sourceIcons.sourceId, sourceId), eq(sourceIcons.kind, 'ICON')));
    await tx
      .update(sourceIcons)
      .set({ candidateId: null, sourceId })
      .where(eq(sourceIcons.id, icon.id));
    await tx
      .update(watchSources)
      .set({ iconMime: icon.mime, updatedAt: new Date() })
      .where(eq(watchSources.id, sourceId));
    return true;
  }

  /** Housekeeping: icons whose suggestion was rejected long ago. */
  async purgeOrphans(olderThan: Date): Promise<number> {
    const rows = await this.db
      .delete(sourceIcons)
      .where(
        and(
          isNull(sourceIcons.sourceId),
          // Never an avatar: those belong to a live account, not a suggestion.
          isNull(sourceIcons.userId),
          sql`${sourceIcons.candidateId} in (
            select id from ${watchSourceCandidates}
            where status = 'REJECTED' and updated_at < ${olderThan}
          )`,
        ),
      )
      .returning({ id: sourceIcons.id });
    return rows.length;
  }
}

export type { SourceIconRow };
