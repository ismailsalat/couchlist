import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { destroySession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  await destroySession();
  return NextResponse.redirect(new URL('/', config().APP_BASE_URL), { status: 303 });
}
