import { z } from 'zod';
import { watchReportReasonSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

const feedbackSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('rate'),
    sourceId: z.string().min(1).max(80),
    rating: z.number().int().min(1).max(5),
  }),
  z.object({
    action: z.literal('react'),
    sourceId: z.string().min(1).max(80),
    reaction: z.enum(['LIKE', 'DISLIKE']),
  }),
  z.object({
    action: z.literal('health'),
    sourceId: z.string().min(1).max(80),
    status: z.enum(['WORKING', 'BROKEN']),
    reason: watchReportReasonSchema.optional(),
  }),
]);

/** Rating and fresh works/broken feedback for a global watch source. */
export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  checkRateLimit(`watch-feedback:${user.id}`, 30);
  const body = feedbackSchema.parse(await request.json());
  const { watchSources, audit } = repos();

  if (body.action === 'rate' || body.action === 'react') {
    const rating = body.action === 'rate' ? body.rating : body.reaction === 'LIKE' ? 5 : 1;
    await watchSources.setSourceRating({
      watchSourceId: body.sourceId,
      userId: user.id,
      rating,
    });
    await audit.record({
      actorId: user.id,
      action: body.action === 'react' ? 'watch.source.reacted' : 'watch.source.rated',
      metadata: { sourceId: body.sourceId, rating, reaction: body.action === 'react' ? body.reaction : undefined },
    });
  } else {
    await watchSources.setSourceHealth({
      watchSourceId: body.sourceId,
      userId: user.id,
      status: body.status,
      reason: body.reason ?? null,
    });
    await audit.record({
      actorId: user.id,
      action: 'watch.source.health_feedback',
      metadata: { sourceId: body.sourceId, status: body.status, reason: body.reason ?? null },
    });
  }

  const stats = await watchSources.sourceStats([body.sourceId], null);
  return { ok: true, stats: stats.get(body.sourceId) ?? null };
});
