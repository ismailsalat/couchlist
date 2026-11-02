import { NextResponse } from 'next/server';
import { loginSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { config } from '@/lib/config';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { signIn } from '@/lib/auth/email-auth';
import { clientKey } from '@/lib/api/client-key';

export const dynamic = 'force-dynamic';

/**
 * Signs in with an email and password.
 *
 * Rate limited per client so the password field cannot be used as an oracle,
 * and the failure message does not distinguish a wrong password from an
 * address that is not registered.
 */
export const POST = apiRoute(async (request) => {
  checkRateLimit(`login:${clientKey(request)}`, config().RATE_LIMIT_LOGIN_PER_MINUTE);

  const input = loginSchema.parse(await request.json());
  const user = await signIn(input);

  return NextResponse.json({
    ok: true,
    emailVerified: Boolean(user.emailVerifiedAt),
  });
});
