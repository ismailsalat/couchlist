import { NextResponse } from 'next/server';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { resendVerification } from '@/lib/auth/email-auth';

export const dynamic = 'force-dynamic';

/**
 * Sends a fresh verification code.
 *
 * The cooldown is enforced in the service, which also supersedes the previous
 * code so only the newest email works.
 */
export const POST = apiRoute(async () => {
  const user = await requireUser();
  const outcome = await resendVerification(user);
  return NextResponse.json({
    ok: true,
    emailDelivered: outcome.emailDelivered,
    devCode: outcome.devCode,
  });
});
