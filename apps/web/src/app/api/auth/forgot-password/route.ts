import { NextResponse } from 'next/server';
import { requestPasswordResetSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { config } from '@/lib/config';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { requestPasswordReset } from '@/lib/auth/email-auth';
import { clientKey } from '@/lib/api/client-key';

export const dynamic = 'force-dynamic';

/**
 * Starts a password reset.
 *
 * Always reports the same thing, so an unknown address is indistinguishable
 * from a known one.
 */
export const POST = apiRoute(async (request) => {
  checkRateLimit(`forgot:${clientKey(request)}`, config().RATE_LIMIT_SIGNUP_PER_MINUTE);

  const { email } = requestPasswordResetSchema.parse(await request.json());
  const outcome = await requestPasswordReset(email);

  return NextResponse.json({ ok: true, devCode: outcome.devCode });
});
