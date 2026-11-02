import { AppError, iconResponseHeaders } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * A listed source's icon.
 *
 * Public, like the listing itself. The stored type is sent back with nosniff
 * and a restrictive content policy, so even an unexpected file cannot execute
 * or pull anything in. The bytes were checked against their magic numbers
 * before they were ever stored.
 */
export const GET = apiRoute<Response, { id: string }>(async (_request, { params }) => {
  const icon = await repos().icons.forSource(params.id);
  if (!icon) throw AppError.notFound('icon');

  return new Response(new Uint8Array(icon.bytes), {
    headers: iconResponseHeaders(icon.mime, true),
  });
});
