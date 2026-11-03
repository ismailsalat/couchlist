import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';
import { checkSite, resetKnownDomainCache } from '@/lib/tools/site-check';

export const dynamic = 'force-dynamic';

const schema = z.object({ note: z.string().trim().max(300).optional() });

/**
 * "We looked at that warning and we are keeping this listing."
 *
 * The set of providers currently flagging the domain is captured here rather
 * than sent by the client: a review has to be anchored to the evidence that
 * actually existed when it was made, and a client-supplied list could be
 * anything. If a new provider flags the domain later, that evidence falls
 * outside the review and the warning returns.
 */
export const POST = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const admin = await requireAdmin();
  const { sources, audit } = repos();

  const row = await sources.findRowById(params.id);
  if (!row) throw AppError.notFound('source');
  if (!row.domain) throw AppError.validation('That listing has no address to check.');

  const { note } = schema.parse(await request.json().catch(() => ({})));

  const verdict = await checkSite({ query: row.domain });
  const flagged = verdict.signals
    .filter((signal) => signal.status === 'flagged' && signal.source !== 'Couchlist')
    .map((signal) => signal.source);

  if (flagged.length === 0) {
    throw AppError.validation('Nothing is flagging this listing, so there is nothing to review.');
  }

  await sources.setReputationReview({
    sourceId: params.id,
    userId: admin.id,
    note: note && note.length > 0 ? note : null,
    sources: flagged,
  });
  resetKnownDomainCache();

  await audit.record({
    actorId: admin.id,
    action: 'source.reputation_review',
    metadata: { sourceId: params.id, keptDespite: flagged },
  });

  return NextResponse.json({ ok: true, reviewed: flagged });
});

/** Withdraw the review, so every warning applies again in full. */
export const DELETE = apiRoute<NextResponse, { id: string }>(async (_request, { params }) => {
  const admin = await requireAdmin();
  const { sources, audit } = repos();

  if (!(await sources.clearReputationReview(params.id))) throw AppError.notFound('source');
  resetKnownDomainCache();

  await audit.record({
    actorId: admin.id,
    action: 'source.reputation_review_cleared',
    metadata: { sourceId: params.id },
  });

  return NextResponse.json({ ok: true });
});
