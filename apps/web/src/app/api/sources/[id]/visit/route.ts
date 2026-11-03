import { NextResponse } from 'next/server';
import { apiRoute } from '@/lib/api/handler';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Somebody opened a listed website.
 *
 * Adds one to a total and does nothing else. No account is read, no address
 * is stored, no session is written. The question this can answer is "which
 * sites do people actually open"; the question it cannot answer, by
 * construction, is "what did this person open".
 *
 * It always replies 204, including when it did nothing at all. A counter is
 * not worth an error in front of somebody who is trying to leave for another
 * website, and a failure here must never interrupt that.
 */
export const POST = apiRoute<Response, { id: string }>(async (_request, { params }) => {
  try {
    await repos().sources.recordVisit(params.id);
  } catch {
    // Deliberately silent: nothing a reader does depends on this working.
  }

  return new NextResponse(null, { status: 204 });
});
