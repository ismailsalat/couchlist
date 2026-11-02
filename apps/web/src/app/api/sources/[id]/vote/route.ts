import { NextResponse } from 'next/server';
import { AppError, sourceVoteSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireVerifiedUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { config } from '@/lib/config';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Casts, changes or clears this account's vote on a source.
 *
 * Returns the server's totals and the viewer's own vote, which is what the
 * control displays: the client's optimistic guess is replaced by this, so a
 * vote cast elsewhere cannot leave a stale number on screen.
 *
 * One vote per account per source is guaranteed by a unique index, not by this
 * handler, so two simultaneous requests cannot both insert.
 */
export const POST = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const user = await requireVerifiedUser();
  checkRateLimit(`vote:${user.id}`, config().RATE_LIMIT_MUTATIONS_PER_MINUTE);

  const { value } = sourceVoteSchema.parse(await request.json());

  const { sources } = repos();
  const source = await sources.findRowById(params.id);
  if (!source) throw AppError.notFound('source');

  const state = await sources.setVote(params.id, user.id, value);
  return NextResponse.json(state);
});
