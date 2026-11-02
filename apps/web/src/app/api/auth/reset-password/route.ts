import { NextResponse } from 'next/server';
import { completePasswordResetSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { config } from '@/lib/config';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { completePasswordReset } from '@/lib/auth/email-auth';
import { clientKey } from '@/lib/api/client-key';

export const dynamic = 'force-dynamic';

/** Completes a password reset with a one-time token from the emailed link. */
export const POST = apiRoute(async (request) => {
  checkRateLimit(`reset:${clientKey(request)}`, config().RATE_LIMIT_LOGIN_PER_MINUTE);

  const input = completePasswordResetSchema.parse(await request.json());
  await completePasswordReset(input.token, input.password);

  return NextResponse.json({ ok: true });
});
