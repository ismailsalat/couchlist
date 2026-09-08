import { AppError, watchTogetherRequestSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { config } from '@/lib/config';
import { repos } from '@/lib/db';
import { suggestForGroup } from '@/lib/services/watch-together';

export const dynamic = 'force-dynamic';

/**
 * Watch Together uses direct Couchlist friends, so it works without any Discord
 * server integration. Arbitrary user ids are rejected server-side.
 */
export const POST = apiRoute(async (request) => {
  const body = watchTogetherRequestSchema.parse(await request.json());
  const user = await requireUser();
  checkRateLimit(`watch:${user.id}`, config().RATE_LIMIT_MUTATIONS_PER_MINUTE);

  const allowed = new Set(await repos().friends.acceptedFriendIds(user.id));
  for (const userId of body.userIds) {
    if (!allowed.has(userId)) {
      throw AppError.forbidden({ reason: 'user_not_friend', userId });
    }
  }

  const requested = [...new Set([user.id, ...body.userIds])];
  const candidates = await suggestForGroup({
    userIds: requested,
    mediaType: body.mediaType,
    allowRewatch: body.allowRewatch,
  });

  return { participants: requested, candidates };
});
