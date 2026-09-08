import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createLogger } from '@couchlist/shared';
import { config } from '@/lib/config';
import { discordOAuth } from '@/lib/auth/discord';
import { completeLogin } from '@/lib/auth/login';
import { safeCompare } from '@/lib/auth/session';
import { STATE_COOKIE } from '@/lib/auth/oauth-state';

export const dynamic = 'force-dynamic';

const log = createLogger({ service: 'web' });

/**
 * Completes Discord OAuth.
 *
 * Every redirect target here is built from APP_BASE_URL, never from a query
 * parameter, so there is no open-redirect surface.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const settings = config();
  const home = (path: string) => new URL(path, settings.APP_BASE_URL);

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!code || !state || !expectedState || !safeCompare(state, expectedState)) {
    log.warn('oauth_failed', { category: 'state_mismatch' });
    return NextResponse.redirect(home('/?error=auth'));
  }

  try {
    const client = discordOAuth(settings.DISCORD_CLIENT_ID, settings.DISCORD_CLIENT_SECRET);
    const redirectUri = home('/api/auth/callback').toString();

    const accessToken = await client.exchangeCode(code, redirectUri);
    const [profile, guilds] = await Promise.all([
      client.fetchUser(accessToken),
      client.fetchGuilds(accessToken),
    ]);

    const result = await completeLogin(profile, guilds);
    if (!result.ok) {
      log.info('login_rejected', { reason: result.reason });
      return NextResponse.redirect(home('/private-testing'));
    }

    log.info('login_succeeded', { userId: result.userId });
    return NextResponse.redirect(home('/home'));
  } catch (error) {
    // Category only - the error may carry token material.
    log.warn('oauth_failed', { category: 'exchange_failed', name: (error as Error)?.name });
    return NextResponse.redirect(home('/?error=auth'));
  }
}
