import { AppError, iconResponseHeaders } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * A picture of what a listed site looks like.
 *
 * Served from Couchlist rather than hot-linked from the site itself, for the
 * same reason its icon is: loading an image straight from a listed site would
 * tell that site who is reading about it. The bytes went through the same
 * magic-byte check every uploaded image does, and come back with nosniff and
 * the sandboxed policy.
 */
export const GET = apiRoute<Response, { id: string }>(async (_request, { params }) => {
  const preview = await repos().icons.previewForSource(params.id);
  if (!preview) throw AppError.notFound('preview');

  return new Response(new Uint8Array(preview.bytes), {
    headers: iconResponseHeaders(preview.mime, true),
  });
});
