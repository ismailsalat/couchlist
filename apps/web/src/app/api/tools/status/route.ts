import { NextResponse } from 'next/server';
import { apiRoute } from '@/lib/api/handler';
import { clientKey } from '@/lib/api/client-key';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';
import { liveStatus } from '@/lib/tools/status';

export const dynamic = 'force-dynamic';

/**
 * What the directory looks like right now.
 *
 * Read straight from the weekly link check, which already collects every bit
 * of this and until now was visible only on the admin pages. Nothing is
 * fetched here: a public endpoint that probed sites on demand would be both
 * a request-forgery surface and a way to point our server at anything.
 */
export const GET = apiRoute(async (request) => {
  checkRateLimit(`tools:status:${clientKey(request)}`, 30);
  return NextResponse.json(await liveStatus(repos()));
});
