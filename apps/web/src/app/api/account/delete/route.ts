import { NextResponse } from 'next/server';
import { deleteAccountSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { deleteOwnAccount } from '@/lib/auth/email-auth';

export const dynamic = 'force-dynamic';

/**
 * Deletes the signed-in account.
 *
 * POST rather than DELETE on purpose: it carries a confirmation body, and a
 * destructive action should not be reachable by anything that follows links.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  checkRateLimit(`delete-account:${user.id}`, 5);

  const input = deleteAccountSchema.parse(await request.json());
  await deleteOwnAccount(user, input.password);

  return NextResponse.json({ ok: true });
});
