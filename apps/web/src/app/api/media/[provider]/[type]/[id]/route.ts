import { mediaIdentitySchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { config } from '@/lib/config';
import { getMediaDetail } from '@/lib/services/media';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Title detail plus the viewer's own entry and the stats for their servers.
 *
 * Server statistics are computed only across guilds the viewer belongs to, so
 * a title page can never leak activity from an unrelated server.
 */
export const GET = apiRoute(async (_request, context) => {
  const params = await (context as unknown as { params: Promise<Record<string, string>> }).params;

  const user = await requireUser();
  checkRateLimit(`media:${user.id}`, config().RATE_LIMIT_SEARCH_PER_MINUTE);

  const identity = mediaIdentitySchema.parse({
    provider: (params.provider ?? '').toUpperCase(),
    mediaType: (params.type ?? '').toUpperCase(),
    providerMediaId: params.id ?? '',
  });

  const { guilds, entries } = repos();

  const detail = await getMediaDetail(identity.provider, identity.mediaType, identity.providerMediaId);

  const userGuilds = await guilds.activeGuildsForUser(user.id);
  const memberIds = new Set<string>([user.id]);
  for (const guild of userGuilds) {
    for (const member of await guilds.membersOf(guild.id)) {
      if (member.id === user.id || member.profileVisibility !== 'PRIVATE') memberIds.add(member.id);
    }
  }

  const scoped = [...memberIds];
  const [stats, ratings, own] = await Promise.all([
    entries.statsForMedia(scoped, identity),
    entries.ratingsForMedia(scoped, identity),
    entries.find(user.id, identity),
  ]);

  return {
    media: detail,
    stats,
    friendRatings: ratings.filter((row) => row.userId !== user.id).slice(0, 10),
    myEntry: own
      ? { status: own.status, rating: own.rating, progress: own.progress }
      : null,
  };
});
