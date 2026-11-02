import { NextResponse } from 'next/server';
import { AppError, CreditMode, parseCreditMode } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Changes how one contribution is credited.
 *
 * The repository scopes the update to rows owned by the caller, so passing
 * somebody else's contribution id updates nothing and returns a 404 rather
 * than rewriting their credit.
 */
export const POST = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const user = await requireUser();
  checkRateLimit(`credit:${user.id}`, 30);

  const body = (await request.json()) as { creditMode?: unknown };
  const creditMode: CreditMode = parseCreditMode(body.creditMode);

  const changed = await repos().contributions.setCreditMode(params.id, user.id, creditMode);
  if (!changed) throw AppError.notFound('contribution');

  return NextResponse.json({ ok: true, creditMode });
});
