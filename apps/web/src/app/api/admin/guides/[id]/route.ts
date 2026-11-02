import { NextResponse } from 'next/server';
import { AppError, adminGuideSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Edits a guide.
 *
 * `markReviewedNow` is a deliberate action, not a side effect of saving: a
 * "last reviewed" date is only written when the editor says they actually
 * checked the links and claims. Otherwise the guide keeps telling readers it
 * has not been verified.
 */
export const PATCH = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const admin = await requireAdmin();
  const { guides, audit } = repos();

  const existing = await guides.findById(params.id);
  if (!existing) throw AppError.notFound('guide');

  const input = adminGuideSchema.parse(await request.json());
  const { markReviewedNow, ...fields } = input;

  await guides.update(existing.id, fields);
  if (markReviewedNow) await guides.markReviewed(existing.id, admin.id);

  await audit.record({
    actorId: admin.id,
    action: 'admin.guide.update',
    metadata: { guideId: existing.id, markedReviewed: markReviewedNow },
  });

  return NextResponse.json({ ok: true, reviewed: markReviewedNow });
});
