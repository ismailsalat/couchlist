import { NextResponse } from 'next/server';
import { verifyEmailSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { verifyEmail } from '@/lib/auth/email-auth';

export const dynamic = 'force-dynamic';

/** Verifies the signed-in account's email with a typed code. */
export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  checkRateLimit(`verify:${user.id}`, 10);

  const { code } = verifyEmailSchema.parse(await request.json());
  await verifyEmail(user, code);

  return NextResponse.json({ ok: true, verified: true });
});
