import { NextResponse } from 'next/server';
import {
  AppError,
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
