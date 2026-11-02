import { NextResponse } from 'next/server';
import { updateProfileSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Updates the signed-in account's own profile. Nobody else's. */
export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  checkRateLimit(`profile:${user.id}`, 20);

  const input = updateProfileSchema.parse(await request.json());
  await repos().accounts.updateProfile(user.id, { displayName: input.displayName });

  return NextResponse.json({ ok: true });
});
