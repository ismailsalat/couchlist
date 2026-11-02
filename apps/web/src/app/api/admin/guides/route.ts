import { NextResponse } from 'next/server';
import { adminGuideSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Creates a guide. Unpublished unless the editor says otherwise. */
export const POST = apiRoute(async (request) => {
  const admin = await requireAdmin();
  const { guides, audit } = repos();

  const input = adminGuideSchema.parse(await request.json());
  const { markReviewedNow, ...fields } = input;

  const guide = await guides.create(fields);
  if (markReviewedNow) await guides.markReviewed(guide.id, admin.id);

  await audit.record({
    actorId: admin.id,
    action: 'admin.guide.create',
    metadata: { guideId: guide.id },
  });

  return NextResponse.json({ ok: true, guideId: guide.id, slug: guide.slug });
});
