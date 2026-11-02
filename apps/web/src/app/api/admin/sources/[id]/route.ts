import { NextResponse } from 'next/server';
import {
  AppError,
  adminDeleteSourceSchema,
  adminHideSchema,
  adminSourceSchema,
  canonicalizeExternalUrl,
  flagsFromCategories,
  normalizeDomain,
} from '@couchlist/shared';
import { sourceRevisions, watchSources } from '@couchlist/db';
import { eq } from 'drizzle-orm';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Edits, hides or restores a source.
 *
 * Every mutation calls `requireAdmin` first. The admin UI hiding a button is
 * not the control: a hand-written request fails here.
 *
 * Hiding is reversible and keeps its reason, so a mistake is one click back
 * rather than a lost row.
 */
export const PATCH = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const admin = await requireAdmin();
  const { sources, db, audit } = repos();

  const existing = await sources.findRowById(params.id);
  if (!existing) throw AppError.notFound('source');

  const input = adminSourceSchema.parse(await request.json());
  const homepageUrl = canonicalizeExternalUrl(input.url);
  const domain = normalizeDomain(input.url);
  if (!homepageUrl || !domain) throw AppError.validation('That web address cannot be used.');

  const flags = flagsFromCategories(input.categories);
  const changed: string[] = [];
  if (existing.name !== input.name) changed.push('name');
  if (existing.homepageUrl !== homepageUrl) changed.push('url');
  if ((existing.description ?? '') !== (input.description ?? '')) changed.push('description');
  if (existing.hasLotsOfAds !== input.hasLotsOfAds) changed.push('ad warning');
  if (existing.shouldAvoid !== input.shouldAvoid) changed.push('avoid warning');
  if ((existing.trustedRank ?? null) !== (input.trustedRank ?? null)) changed.push('trusted pick');
  if ((existing.avoidReason ?? '') !== (input.avoidReason ?? '')) changed.push('avoid reason');
  if (existing.adminRankPenalty !== input.adminRankPenalty) changed.push('rank penalty');

  await db.transaction(async (tx) => {
    await tx
      .update(watchSources)
      .set({
        name: input.name,
        domain,
        homepageUrl,
        description: input.description ?? null,
        hasLotsOfAds: input.hasLotsOfAds,
        shouldAvoid: input.shouldAvoid,
        trustedRank: input.trustedRank ?? null,
        // The note and the timestamp only mean something while it is a pick.
        trustedNote: input.trustedRank != null ? (input.trustedNote ?? null) : null,
        trustedAt:
          input.trustedRank != null ? (existing.trustedAt ?? new Date()) : null,
        // The reason is only meaningful while the warning is on.
        avoidReason: input.shouldAvoid ? (input.avoidReason ?? null) : null,
        isEnabled: input.isEnabled,
        adminRankPenalty: input.adminRankPenalty,
        ...flags,
        updatedAt: new Date(),
      })
      .where(eq(watchSources.id, existing.id));

    if (changed.length > 0) {
      await tx.insert(sourceRevisions).values({
        sourceId: existing.id,
        summary: `Edited ${changed.join(', ')}`,
        changedFields: changed,
        appliedByUserId: admin.id,
      });
    }
  });

  await audit.record({
    actorId: admin.id,
    action: 'admin.source.update',
    metadata: { sourceId: existing.id, changed },
  });

  return NextResponse.json({ ok: true, changed });
});

/** Hides or restores. Nothing is deleted, so nothing is unrecoverable. */
export const POST = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const admin = await requireAdmin();
  const { sources, db, audit } = repos();

  const existing = await sources.findRowById(params.id);
  if (!existing) throw AppError.notFound('source');

  const input = adminHideSchema.parse(await request.json());

  await db
    .update(watchSources)
    .set({
      isEnabled: !input.hidden,
      hiddenAt: input.hidden ? new Date() : null,
      hiddenReason: input.hidden ? (input.reason ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(watchSources.id, existing.id));

  await audit.record({
    actorId: admin.id,
    action: input.hidden ? 'admin.source.hide' : 'admin.source.restore',
    metadata: { sourceId: existing.id, reason: input.reason },
  });

  return NextResponse.json({ ok: true, hidden: input.hidden });
});

/**
 * Permanently removes a source.
 *
 * Hiding is the usual answer and it keeps everything: a hidden source still
 * holds its votes, its saves and the credit of whoever found it. Deleting is
 * for the cases hiding cannot cover — a listing created by mistake, a
 * duplicate, or something that should never have been in the database at all.
 *
 * Because it cannot be undone, it is deliberately awkward: the caller has to
 * send back the exact domain being deleted. A misdirected click cannot
 * produce that, and the admin interface shows what will go with it first.
 *
 * Everything that references the source goes with it through ON DELETE
 * CASCADE: votes, saves and notes, contributions and credit, revisions,
 * reports, any uploaded icon, and its place in anyone's collection. The
 * accounts stay. The audit entry stays too, so the deletion itself is on
 * record even though its subject is not.
 */
export const DELETE = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const admin = await requireAdmin();

  const input = adminDeleteSourceSchema.parse(await request.json());
  const existing = await repos().sources.findRowById(params.id);
  if (!existing) throw AppError.notFound('source');

  if (input.confirmDomain.trim().toLowerCase() !== existing.domain.toLowerCase()) {
    throw AppError.validation(
      'Type the exact domain to confirm. Nothing was deleted.',
    );
  }

  const counts = await repos().sources.referenceCounts(params.id);

  // The audit entry is written first and deliberately outside the delete, so
  // a record of the removal survives even if the delete itself fails.
  await repos().audit.record({
    actorId: admin.id,
    action: 'source_deleted',
    // The row is about to be gone, so what it was lives here instead.
    metadata: {
      sourceId: existing.id,
      name: existing.name,
      domain: existing.domain,
      homepageUrl: existing.homepageUrl,
      ...counts,
      reason: input.reason ?? null,
    },
  });

  await repos().db.delete(watchSources).where(eq(watchSources.id, existing.id));

  return NextResponse.json({ ok: true, deleted: existing.domain, removed: counts });
});
