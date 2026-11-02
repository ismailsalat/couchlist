import { NextResponse } from 'next/server';
import { signupSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { config } from '@/lib/config';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { signUp } from '@/lib/auth/email-auth';
import { clientKey } from '@/lib/api/client-key';

export const dynamic = 'force-dynamic';

/**
 * Creates an account and sends a verification code.
 *
 * The response is the same whether or not the address was already registered,
 * so this endpoint cannot be used to discover who has an account. It reports
 * honestly whether the email actually went out.
 */
export const POST = apiRoute(async (request) => {
  checkRateLimit(`signup:${clientKey(request)}`, config().RATE_LIMIT_SIGNUP_PER_MINUTE);

  const input = signupSchema.parse(await request.json());
  const outcome = await signUp(input);

  return NextResponse.json({
    ok: true,
    emailDelivered: outcome.emailDelivered,
    devCode: outcome.devCode,
  });
});
