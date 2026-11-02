import { NextResponse } from 'next/server';
import { AppError, reportSourceSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireVerifiedUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { config } from '@/lib/config';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Reports a problem with a listing.
 *
 * The three reasons are Broken link, Lots of ads and Something else; there is
 * no taxonomy to learn. A second open report from the same person about the
 * same source is accepted without creating duplicate work, because a partial
 * unique index collapses it.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireVerifiedUser();
  checkRateLimit(`report:${user.id}`, Math.min(config().RATE_LIMIT_MUTATIONS_PER_MINUTE, 10));

  const input = reportSourceSchema.parse(await request.json());

  const { sources, contributions } = repos();
  if (!(await sources.findRowById(input.sourceId))) throw AppError.notFound('source');

  const result = await contributions.reportSource({
    sourceId: input.sourceId,
    reportedByUserId: user.id,
    reason: input.reason,
    details: input.details ?? null,
  });

  return NextResponse.json({ ok: true, alreadyReported: result.duplicate ?? false });
});
