import { AppError, iconResponseHeaders } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * A profile picture.
 *
 * Public, because profiles are. Served with nosniff and the same restrictive
 * content policy as a site icon, so even an unexpected file cannot execute or
 * fetch anything. A deleted account serves nothing: the row goes with it.
 */
export const GET = apiRoute<Response, { userId: string }>(async (_request, { params }) => {
  const account = await repos().accounts.findById(params.userId);
  if (!account || account.deletedAt) throw AppError.notFound('avatar');

  const avatar = await repos().icons.forUser(params.userId);
  if (!avatar) throw AppError.notFound('avatar');

  return new Response(new Uint8Array(avatar.bytes), {
    headers: iconResponseHeaders(avatar.mime, true),
  });
});
