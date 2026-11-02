import { NextResponse } from 'next/server';
import {
  AppError,
  ERROR_CODES,
  canonicalizeExternalUrl,
  checkIconUpload,
  normalizeDomain,
  parseExternalUrl,
  suggestSourceSchema,
} from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireVerifiedUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { config } from '@/lib/config';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Suggests a new source.
 *
 * The URL is validated and normalised but never fetched: saving a form must
 * not turn into a server-side request to an address a stranger chose. Duplicate
 * detection is on the normalised domain, and the partial unique index is the
 * real guarantee against two simultaneous submissions.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireVerifiedUser();
  checkRateLimit(`suggest:${user.id}`, Math.min(config().RATE_LIMIT_MUTATIONS_PER_MINUTE, 10));

  const input = suggestSourceSchema.parse(await request.json());

  const parsed = parseExternalUrl(input.url);
  if (!parsed) {
    throw new AppError(ERROR_CODES.CL_VALIDATION_FAILED, {
      userMessage: 'That web address cannot be used. Use a full http:// or https:// address.',
    });
  }

  const domain = normalizeDomain(parsed.url.hostname);
  const homepageUrl = canonicalizeExternalUrl(input.url);
  if (!domain || !homepageUrl) {
    throw new AppError(ERROR_CODES.CL_VALIDATION_FAILED, {
      userMessage: 'That web address cannot be used.',
    });
  }

  /*
   * The icon is validated before anything is written, so a bad file fails the
   * whole submission rather than leaving a suggestion with a broken image.
   */
  const icon = input.icon ? checkIconUpload(input.icon) : null;
  if (icon && !icon.ok) throw AppError.validation(icon.message);

  const outcome = await repos().contributions.suggestSource({
    domain,
    homepageUrl,
    name: input.name,
    description: input.description ?? null,
    categories: input.categories,
    explanation: input.explanation ?? null,
    submittedByUserId: user.id,
    creditMode: input.creditMode,
  });

  if (!outcome.ok) {
    const message =
      outcome.reason === 'already_listed'
        ? `${domain} is already in the directory.`
        : `${domain} has already been suggested and is waiting for review.`;

    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.CL_DUPLICATE_LIST_ENTRY,
          message,
          requestId: 'duplicate',
          sourceId: outcome.existingSourceId,
        },
      },
      { status: 409 },
    );
  }

  if (icon?.ok) {
    await repos().icons.setCandidateIcon(
      outcome.candidate.id,
      { mime: icon.mime, bytes: icon.bytes, byteSize: icon.byteSize },
      user.id,
    );
  }

  return NextResponse.json({
    ok: true,
    candidateId: outcome.candidate.id,
    // True when this replaced the caller's own earlier suggestion for the
    // same website, rather than adding another.
    updatedExisting: outcome.updatedExisting ?? false,
  });
});
