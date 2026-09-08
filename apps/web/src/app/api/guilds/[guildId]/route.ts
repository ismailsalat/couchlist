import { apiRoute } from '@/lib/api/handler';
import { requireGuildMember } from '@/lib/api/guards';
import { buildGuildPage } from '@/lib/services/guild';
import { AppError } from '@couchlist/shared';

export const dynamic = 'force-dynamic';

/**
 * One server's page.
 *
 * `requireGuildMember` enforces membership and the test-mode allowlist, so
 * changing the id in the URL cannot reach another server's data.
 */
export const GET = apiRoute(async (_request, context) => {
  const params = await (context as unknown as { params: Promise<{ guildId: string }> }).params;
  const access = await requireGuildMember(params.guildId);

  const page = await buildGuildPage(access.user.id, access.guildId);
  if (!page) throw AppError.notFound('server');
  return page;
});
