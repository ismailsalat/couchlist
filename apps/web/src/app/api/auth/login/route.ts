import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { config } from '@/lib/config';
import { discordOAuth } from '@/lib/auth/discord';
import { STATE_COOKIE } from '@/lib/auth/oauth-state';

export const dynamic = 'force-dynamic';

/**
 * Starts Discord OAuth.
 *
 * The state value is stored in a short-lived HTTP-only cookie and checked on
 * return, which is what stops a third party from completing a login on
 * someone else's behalf.
 */
export async function GET(): Promise<NextResponse> {
  const settings = config();
  const state = randomBytes(24).toString('base64url');

  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: settings.isProduction,
    path: '/',
    maxAge: 600,
  });

  const redirectUri = new URL('/api/auth/callback', settings.APP_BASE_URL).toString();
  const url = discordOAuth(
    settings.DISCORD_CLIENT_ID,
    settings.DISCORD_CLIENT_SECRET,
  ).authorizeUrl(state, redirectUri);

  return NextResponse.redirect(url);
}
