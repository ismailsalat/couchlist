import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { clientKey } from '@/lib/api/client-key';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { optionalUser } from '@/lib/api/guards';
import { InvalidDomainError, checkSite } from '@/lib/tools/site-check';

export const dynamic = 'force-dynamic';

const schema = z.object({ query: z.string().min(1).max(260) });

/**
 * The safety checker.
 *
 * Open to anybody, because a tool that protects people is worth nothing
 * behind a sign-in wall. That makes the rate limit the only thing standing
 * between this and the free quotas of the providers behind it, so the limit
 * is deliberately tight and keyed by account where there is one and by
 * client otherwise.
 *
 * The handler never fetches the address it is given. It looks a *hostname* up
 * in our own tables and asks reputation providers about it; nothing here
 * retrieves user-supplied URLs, which is what keeps a public form from
 * becoming a request-forgery proxy.
 */
export const POST = apiRoute(async (request) => {
  const user = await optionalUser();
  const key = user ? `tools:check:user:${user.id}` : `tools:check:${clientKey(request)}`;
  checkRateLimit(key, user ? 30 : 10);

  const { query } = schema.parse(await request.json());

  try {
    return NextResponse.json(await checkSite({ query }));
  } catch (error) {
    if (error instanceof InvalidDomainError) throw AppError.validation(error.message);
    throw error;
  }
});
