import { NextResponse } from 'next/server';
import {
  AppError,
  canonicalizeExternalUrl,
  suggestCorrectionSchema,
} from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireVerifiedUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { config } from '@/lib/config';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Suggests a correction to an existing listing.
 *
 * A correction references the source it corrects, so a moderator never has to
 * guess which listing a report is about. Nothing is applied until it is
 * approved.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireVerifiedUser();
  checkRateLimit(`correct:${user.id}`, Math.min(config().RATE_LIMIT_MUTATIONS_PER_MINUTE, 10));

  const input = suggestCorrectionSchema.parse(await request.json());

  const { sources, contributions } = repos();
  const source = await sources.findRowById(input.sourceId);
  if (!source) throw AppError.notFound('source');

  const proposedUrl = input.proposedUrl ? canonicalizeExternalUrl(input.proposedUrl) : undefined;

  const candidate = await contributions.suggestCorrection({
    targetSourceId: source.id,
    domain: source.domain,
    submittedByUserId: user.id,
    creditMode: input.creditMode,
    explanation: input.explanation ?? null,
    proposedName: input.proposedName,
    proposedUrl: proposedUrl ?? undefined,
    proposedDescription: input.proposedDescription,
    proposedCategories: input.proposedCategories,
    proposedHasLotsOfAds: input.proposedHasLotsOfAds,
  });

  return NextResponse.json({ ok: true, candidateId: candidate.id });
});
