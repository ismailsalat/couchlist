import { AppError, iconResponseHeaders } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * An icon attached to a suggestion that is still pending.
 *
 * Administrators only, and never cached: nothing submitted but unreviewed is
 * public, and an icon is as much a submission as the text beside it.
 */
export const GET = apiRoute<Response, { id: string }>(async (_request, { params }) => {
  await requireAdmin();

  const icon = await repos().icons.forCandidate(params.id);
  if (!icon) throw AppError.notFound('icon');

  return new Response(new Uint8Array(icon.bytes), {
    headers: iconResponseHeaders(icon.mime, false),
  });
});
