import { z } from 'zod';
import { AppError, watchReportReasonSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireGuildMember } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = { requestId: string; params: Promise<{ guildId: string }> };

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('share'),
    homepageUrl: z.string().min(1).max(2048),
    suggestedName: z.string().max(120).optional(),
    comment: z.string().max(500).optional(),
    contentKey: z.string().max(220).optional(),
    mediaType: z.enum(['ANIME', 'MOVIE', 'TV']).optional(),
    mediaTitle: z.string().max(180).optional(),
    supportsAnime: z.boolean().default(false),
    supportsMovies: z.boolean().default(false),
    supportsTv: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('rate'),
    postId: z.string().min(1).max(80),
    rating: z.number().int().min(1).max(5),
  }),
  z.object({
    action: z.literal('health'),
    postId: z.string().min(1).max(80),
    status: z.enum(['WORKING', 'BROKEN']),
    reason: watchReportReasonSchema.optional(),
  }),
  z.object({
    action: z.literal('report'),
    postId: z.string().min(1).max(80),
    reason: watchReportReasonSchema,
    details: z.string().max(500).optional(),
  }),
  z.object({ action: z.literal('promote'), postId: z.string().min(1).max(80) }),
]);

export const GET = apiRoute(async (_request, context) => {
  const { guildId } = await (context as RouteContext).params;
  const access = await requireGuildMember(guildId);
  return { posts: await repos().watchSources.listServerPosts(access.guildId) };
});

export const POST = apiRoute(async (request, context) => {
  const { guildId } = await (context as RouteContext).params;
  const access = await requireGuildMember(guildId);
  checkRateLimit(`server-watch:${access.user.id}:${access.guildId}`, 40);

  const body = actionSchema.parse(await request.json());
  const { watchSources, audit } = repos();

  if (body.action === 'share') {
    const post = await watchSources.shareWithServer({
      guildId: access.guildId,
      userId: access.user.id,
      ...body,
    });
    await audit.record({
      actorId: access.user.id,
      guildId: access.guildId,
      action: 'watch.server_source.shared',
      metadata: { postId: post.id, domain: post.domain },
    });
    return { ok: true, post };
  }

  const post = await watchSources.findServerPostById(body.postId);
  if (!post || post.guildId !== access.guildId || post.isHidden) throw AppError.notFound('server source');

  if (body.action === 'rate') {
    if (post.watchSourceId) {
      await watchSources.setSourceRating({
        watchSourceId: post.watchSourceId,
        userId: access.user.id,
        guildId: access.guildId,
        rating: body.rating,
      });
    } else {
      await watchSources.setPostRating({
        serverWatchPostId: post.id,
        userId: access.user.id,
        guildId: access.guildId,
        rating: body.rating,
      });
    }
  } else if (body.action === 'health') {
    if (post.watchSourceId) {
      await watchSources.setSourceHealth({
        watchSourceId: post.watchSourceId,
        userId: access.user.id,
        guildId: access.guildId,
        status: body.status,
        reason: body.reason ?? null,
      });
    } else {
      await watchSources.setPostHealth({
        serverWatchPostId: post.id,
        userId: access.user.id,
        guildId: access.guildId,
        status: body.status,
        reason: body.reason ?? null,
      });
    }
  } else if (body.action === 'report') {
    await watchSources.createReport({
      serverWatchPostId: post.id,
      reportedByUserId: access.user.id,
      reason: body.reason,
      details: body.details ?? null,
    });
  } else if (body.action === 'promote') {
    const accepted = await watchSources.promoteServerPostToCandidate(post.id, access.user.id);
    return { ok: true, accepted };
  }

  await audit.record({
    actorId: access.user.id,
    guildId: access.guildId,
    action: `watch.server_source.${body.action}`,
    metadata: { postId: post.id },
  });
  return { ok: true };
});
