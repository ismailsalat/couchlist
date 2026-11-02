import { NextResponse } from 'next/server';
import {
  AppError,
  adminReviewSchema,
  canonicalizeExternalUrl,
  normalizeDomain,
} from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Approves or rejects a suggestion.
 *
 * Approving a new source creates the listing, records original credit and
 * marks the candidate approved inside one transaction, so a failure cannot
 * leave a half-approved entry. Approving a correction applies it and credits
 * the corrector separately, without touching the original credit.
 *
 * A moderator may make small edits here, so an otherwise-good suggestion with
 * a typo does not have to be rejected and retyped into another form.
 */
export const POST = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const admin = await requireAdmin();
  const { contributions, audit } = repos();

  const candidate = await contributions.findCandidateById(params.id);
  if (!candidate) throw AppError.notFound('suggestion');
  if (candidate.status !== 'PENDING') {
    throw AppError.validation('That suggestion has already been reviewed.');
  }

  const input = adminReviewSchema.parse(await request.json());

  if (input.decision === 'REJECT') {
    await contributions.rejectCandidate(candidate.id, admin.id, input.reviewNotes);
    await audit.record({
      actorId: admin.id,
      action: 'admin.suggestion.reject',
      metadata: { candidateId: candidate.id },
    });
    return NextResponse.json({ ok: true, decision: 'REJECTED' });
  }

  if (candidate.kind === 'CORRECTION') {
    const result = await contributions.approveCorrection(
      candidate.id,
      admin.id,
      input.reviewNotes,
    );
    await audit.record({
      actorId: admin.id,
      action: 'admin.correction.approve',
      metadata: { candidateId: candidate.id, sourceId: result.source.id, changed: result.changed },
    });
    return NextResponse.json({
      ok: true,
      decision: 'APPROVED',
      sourceId: result.source.id,
      changed: result.changed,
    });
  }

  const edits = input.edits ?? {};
  const homepageUrl = edits.url ? canonicalizeExternalUrl(edits.url) : undefined;
  const domain = edits.url ? normalizeDomain(edits.url) : undefined;
  if (edits.url && (!homepageUrl || !domain)) {
    throw AppError.validation('That web address cannot be used.');
  }

  const result = await contributions.approveNewSource(
    candidate.id,
    admin.id,
    {
      name: edits.name,
      description: edits.description,
      categories: edits.categories,
      hasLotsOfAds: edits.hasLotsOfAds,
      ...(homepageUrl ? { homepageUrl } : {}),
      ...(domain ? { domain } : {}),
    },
    input.reviewNotes,
  );

  await audit.record({
    actorId: admin.id,
    action: 'admin.suggestion.approve',
    metadata: { candidateId: candidate.id, sourceId: result.source.id },
  });

  return NextResponse.json({ ok: true, decision: 'APPROVED', sourceId: result.source.id });
});
