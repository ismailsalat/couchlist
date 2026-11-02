import { NextResponse } from 'next/server';
import { AppError, adminReviewSchema } from '@couchlist/shared';
import { guideSuggestions, sourceContributions } from '@couchlist/db';
import { eq } from 'drizzle-orm';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Reviews a community guide submission.
 *
 * Approving a new guide creates it from the submission and records the
 * contributor's credit in the same transaction, so the admin never has to copy
 * the text into another form by hand. A correction or broken-link report is
 * marked approved once acted on, which is what tells the submitter it helped.
 */
export const POST = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const admin = await requireAdmin();
  const { guides, db, audit } = repos();

  const suggestion = await guides.findSuggestionById(params.id);
  if (!suggestion) throw AppError.notFound('guide suggestion');
  if (suggestion.status !== 'PENDING') {
    throw AppError.validation('That submission has already been reviewed.');
  }

  const input = adminReviewSchema.parse(await request.json());

  if (input.decision === 'REJECT') {
    await db
      .update(guideSuggestions)
      .set({
        status: 'REJECTED',
        reviewedByUserId: admin.id,
        reviewedAt: new Date(),
        reviewNotes: input.reviewNotes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(guideSuggestions.id, suggestion.id));

    await audit.record({
      actorId: admin.id,
      action: 'admin.guide-suggestion.reject',
      metadata: { suggestionId: suggestion.id },
    });
    return NextResponse.json({ ok: true, decision: 'REJECTED' });
  }

  const result = await db.transaction(async (tx) => {
    let createdGuideId: string | null = null;

    if (suggestion.kind === 'NEW_GUIDE' && suggestion.title && suggestion.topic) {
      // Created unpublished and unreviewed: approving the submission accepts
      // the contribution, it does not certify the content.
      const slugBase = suggestion.title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-+|-+$/gu, '')
        .slice(0, 70);

      const created = await guides.create({
        slug: `${slugBase || 'guide'}-${suggestion.id.slice(-6)}`,
        title: suggestion.title,
        task: 'Community submission',
        topic: suggestion.topic,
        summary: suggestion.body.slice(0, 400),
        steps: [],
        links: Array.isArray(suggestion.links) ? suggestion.links : [],
        isPublished: false,
        deviceLabel: '',
      });
      createdGuideId = created.id;

      await tx.insert(sourceContributions).values({
        guideId: created.id,
        userId: suggestion.submittedByUserId,
        kind: 'GUIDE',
        creditMode: suggestion.creditMode,
        summary: 'Submitted this guide',
      });
    } else if (suggestion.targetGuideId) {
      await tx.insert(sourceContributions).values({
        guideId: suggestion.targetGuideId,
        userId: suggestion.submittedByUserId,
        kind: 'GUIDE_CORRECTION',
        creditMode: suggestion.creditMode,
        summary:
          suggestion.kind === 'BROKEN_LINK'
            ? 'Reported a broken link'
            : 'Corrected this guide',
      });
    }

    await tx
      .update(guideSuggestions)
      .set({
        status: 'APPROVED',
        reviewedByUserId: admin.id,
        reviewedAt: new Date(),
        reviewNotes: input.reviewNotes ?? null,
        promotedGuideId: createdGuideId,
        updatedAt: new Date(),
      })
      .where(eq(guideSuggestions.id, suggestion.id));

    return { createdGuideId };
  });

  await audit.record({
    actorId: admin.id,
    action: 'admin.guide-suggestion.approve',
    metadata: { suggestionId: suggestion.id, guideId: result.createdGuideId },
  });

  return NextResponse.json({ ok: true, decision: 'APPROVED', guideId: result.createdGuideId });
});
