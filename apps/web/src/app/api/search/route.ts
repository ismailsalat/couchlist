import { searchQuerySchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { config } from '@/lib/config';
import { searchMedia } from '@/lib/services/media';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (request) => {
  const user = await requireUser();
  checkRateLimit(`search:${user.id}`, config().RATE_LIMIT_SEARCH_PER_MINUTE);

  const url = new URL(request.url);
  const { q, type } = searchQuerySchema.parse({
    q: url.searchParams.get('q') ?? '',
    type: url.searchParams.get('type') ?? 'all',
  });

  return searchMedia(q, type);
});
