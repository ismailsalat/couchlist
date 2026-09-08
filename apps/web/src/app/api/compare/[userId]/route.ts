import { apiRoute } from '@/lib/api/handler';
import { requireProfileAccess } from '@/lib/api/guards';
import { compareUsers } from '@/lib/services/compare';

export const dynamic = 'force-dynamic';

/**
 * Taste comparison.
 *
 * `requireProfileAccess` requires a Couchlist friendship or shared connected
 * server and respects the target's privacy setting.
 */
export const GET = apiRoute(async (_request, context) => {
  const params = await (context as unknown as { params: Promise<{ userId: string }> }).params;
  const { viewer, target } = await requireProfileAccess(params.userId);
  return compareUsers(viewer, target);
});
