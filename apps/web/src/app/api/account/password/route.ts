import { NextResponse } from 'next/server';
import { changePasswordSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { changePassword } from '@/lib/auth/email-auth';

export const dynamic = 'force-dynamic';

/**
 * Changes the password.
 *
 * Requires the current password, then drops every other session so a change
 * actually locks out anyone else who was signed in.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  checkRateLimit(`password:${user.id}`, 10);

  const input = changePasswordSchema.parse(await request.json());
  await changePassword(user, input.currentPassword, input.newPassword);

  return NextResponse.json({ ok: true });
});
