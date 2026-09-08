import { NextResponse } from 'next/server';
import {
  AppError,
  ERROR_CODES,
  mediaIdentitySchema,
  isValidIdentity,
  supportsEpisodeProgress,
  updateListEntrySchema,
  upsertListEntrySchema,
} from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { config } from '@/lib/config';
import { repos } from '@/lib/db';
import { getMediaDetail } from '@/lib/services/media';

export const dynamic = 'force-dynamic';

/**
 * Progress cannot exceed a known episode count.
 *
 * When the provider does not publish a count - common for ongoing series -
 * any non-negative value is accepted rather than blocking the user.
 */
function assertProgressWithinRange(progress: number | null, episodeCount: number | null): void {
  if (progress === null || episodeCount === null || episodeCount <= 0) return;
  if (progress > episodeCount) {
    throw AppError.validation(`That title only has ${episodeCount} episodes.`);
  }
}

/** The signed-in user's own list. */
export const GET = apiRoute(async () => {
  const user = await requireUser();
  const { entries } = repos();
  const [rows, counts] = await Promise.all([
    entries.listForUser(user.id),
    entries.countsByStatus(user.id),
  ]);
  return { counts, entries: rows };
});

/**
 * Add or update a title.
 *
 * The title and poster are resolved server-side from the provider rather than
 * trusted from the request body, so a client cannot write arbitrary text into
 * other people's server pages.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  checkRateLimit(`mutate:${user.id}`, config().RATE_LIMIT_MUTATIONS_PER_MINUTE);

  const input = upsertListEntrySchema.parse(await request.json());
  if (!isValidIdentity(input.media)) throw AppError.validation('unsupported media type');

  if (input.progress != null && !supportsEpisodeProgress(input.media.mediaType)) {
    throw AppError.validation('Movies do not track episode progress.');
  }

  const detail = await getMediaDetail(
    input.media.provider,
    input.media.mediaType,
    input.media.providerMediaId,
  );

  assertProgressWithinRange(input.progress ?? null, detail.episodeCount);

  const entry = await repos().entries.upsert({
    userId: user.id,
    ...input.media,
    status: input.status,
    rating: input.rating ?? null,
    progress: input.progress ?? null,
    title: detail.title,
    posterUrl: detail.posterUrl,
  });

  return NextResponse.json({ entry }, { status: 201 });
});

/** Change status, rating or progress on an existing entry. */
export const PATCH = apiRoute(async (request) => {
  const user = await requireUser();
  checkRateLimit(`mutate:${user.id}`, config().RATE_LIMIT_MUTATIONS_PER_MINUTE);

  const body = (await request.json()) as Record<string, unknown>;
  const identity = mediaIdentitySchema.parse(body.media);
  if (!isValidIdentity(identity)) throw AppError.validation('That is not a supported title.');
  const update = updateListEntrySchema.parse(body);

  if (update.progress != null && !supportsEpisodeProgress(identity.mediaType)) {
    throw AppError.validation('Movies do not track episode progress.');
  }

  // An unknown episode count means we cannot bound progress, so it is allowed.
  if (update.progress != null) {
    const detail = await getMediaDetail(
      identity.provider,
      identity.mediaType,
      identity.providerMediaId,
    ).catch(() => null);
    assertProgressWithinRange(update.progress, detail?.episodeCount ?? null);
  }

  const entry = await repos().entries.update(user.id, identity, update);
  if (!entry) throw new AppError(ERROR_CODES.CL_NOT_FOUND, { userMessage: 'That title is not on your list.' });

  return { entry };
});

/** Remove a title from the list. */
export const DELETE = apiRoute(async (request) => {
  const user = await requireUser();
  checkRateLimit(`mutate:${user.id}`, config().RATE_LIMIT_MUTATIONS_PER_MINUTE);

  const body = (await request.json()) as Record<string, unknown>;
  const identity = mediaIdentitySchema.parse(body.media);
  if (!isValidIdentity(identity)) throw AppError.validation('That is not a supported title.');

  const removed = await repos().entries.remove(user.id, identity);
  if (!removed) throw new AppError(ERROR_CODES.CL_NOT_FOUND, { userMessage: 'That title is not on your list.' });

  return { ok: true };
});
