import { NextResponse } from 'next/server';
import { apiRoute } from '@/lib/api/handler';
import { signOut } from '@/lib/auth/email-auth';

export const dynamic = 'force-dynamic';

/**
 * Signs out.
 *
 * POST only, so a link or an image cannot sign somebody out, and it answers
 * with JSON rather than a redirect so the client can refresh in place.
 */
export const POST = apiRoute(async () => {
  await signOut();
  return NextResponse.json({ ok: true });
});
