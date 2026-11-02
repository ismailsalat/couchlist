import { NextResponse } from 'next/server';
import { AppError, guideCorrectionSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireVerifiedUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Reports a broken link in a guide, or suggests a correction to it. */
export const POST = apiRoute(async (request) => {
  const user = await requireVerifiedUser();
  checkRateLimit(`guide-correct:${user.id}`, 10);

  const input = guideCorrectionSchema.parse(await request.json());

  const { guides } = repos();
  const guide = await guides.findById(input.guideId);
  if (!guide) throw AppError.notFound('guide');

  const suggestion = await guides.createSuggestion({
    kind: input.kind,
    targetGuideId: guide.id,
    submittedByUserId: user.id,
    creditMode: input.creditMode,
    body: input.body,
    links: input.links,
  });

  return NextResponse.json({ ok: true, suggestionId: suggestion.id });
});
