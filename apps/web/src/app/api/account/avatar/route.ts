import { NextResponse } from 'next/server';
import { AppError, checkIconUpload } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The signed-in account's own profile picture. Nobody else's.
 *
 * The upload goes through exactly the same validation as a site icon: the
 * format is read from the file's own leading bytes, SVG is refused outright,
 * and the size cap is applied to the decoded bytes. A picture a stranger can
 * put on a public profile is no less hostile than one on a listing.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  checkRateLimit(`avatar:${user.id}`, 10);

  const body = (await request.json()) as { image?: unknown };
  const checked = checkIconUpload(body.image);
  if (!checked.ok) throw AppError.validation(checked.message);

  await repos().icons.setUserAvatar(user.id, {
    mime: checked.mime,
    bytes: checked.bytes,
    byteSize: checked.byteSize,
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = apiRoute(async () => {
  const user = await requireUser();
  await repos().icons.removeUserAvatar(user.id);
  return NextResponse.json({ ok: true });
});
