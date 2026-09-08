import { z } from 'zod';
import { AppError, isUserAllowed } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { config } from '@/lib/config';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

const friendActionSchema = z.object({
  targetUserId: z.string().min(1).max(64),
  action: z.enum(['request', 'accept', 'remove']),
});

/**
 * Direct Couchlist friendships.
 *
 * This deliberately does not depend on a Discord guild. Servers are optional
 * community hubs; a Couchlist friendship is a separate, explicit relationship.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  checkRateLimit(`friend:${user.id}`, config().RATE_LIMIT_MUTATIONS_PER_MINUTE);

  const body = friendActionSchema.parse(await request.json());
  if (body.targetUserId === user.id) throw AppError.validation("You can't add yourself.");

  const { users, friends, audit } = repos();
  const target = await users.findById(body.targetUserId);
  if (!target || !isUserAllowed(config(), target.discordId)) throw AppError.notFound('user');

  if (body.action === 'request') {
    const relationship = await friends.request(user.id, target.id);
    await audit.record({ actorId: user.id, action: 'friend.requested' });
    return { ok: true, status: relationship.status };
  }

  if (body.action === 'accept') {
    const accepted = await friends.accept(user.id, target.id);
    if (!accepted) throw AppError.validation('That friend request is no longer available.');
    await audit.record({ actorId: user.id, action: 'friend.accepted' });
    return { ok: true, status: 'ACCEPTED' };
  }

  const removed = await friends.remove(user.id, target.id);
  if (removed) await audit.record({ actorId: user.id, action: 'friend.removed' });
  return { ok: true, removed };
});
