import { NextResponse } from 'next/server';
import { AppError, bookmarkSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { config } from '@/lib/config';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Saves or unsaves a source website.
 *
 * Saving needs an account but not a verified email: it is a private
 * convenience, not a public contribution. The optional note belongs to its
 * owner and never appears in a public response.
 */
export const POST = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const user = await requireUser();
  checkRateLimit(`save:${user.id}`, config().RATE_LIMIT_MUTATIONS_PER_MINUTE);

  const body = await request.json().catch(() => ({}));
  const { note } = bookmarkSchema.parse(body ?? {});

  const { sources } = repos();
  if (!(await sources.findRowById(params.id))) throw AppError.notFound('source');

  await sources.setBookmark(params.id, user.id, true, note ?? undefined);
  return NextResponse.json({ saved: true });
});

export const DELETE = apiRoute<NextResponse, { id: string }>(async (_request, { params }) => {
  const user = await requireUser();
  checkRateLimit(`save:${user.id}`, config().RATE_LIMIT_MUTATIONS_PER_MINUTE);

  await repos().sources.setBookmark(params.id, user.id, false);
  return NextResponse.json({ saved: false });
});
