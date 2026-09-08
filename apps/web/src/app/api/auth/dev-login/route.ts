import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@couchlist/shared';
import { config } from '@/lib/config';
import { completeLogin } from '@/lib/auth/login';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

const log = createLogger({ service: 'web' });

/**
 * Development-only login.
 *
 * Exists so Playwright can sign in without live Discord OAuth. It is guarded
 * three ways: ALLOW_DEV_LOGIN must be true, ENVIRONMENT must be development or
 * test, and startup validation refuses to boot production with the flag on. If
 * any of those slip, this route 404s rather than authenticating anyone.
 */
const bodySchema = z.object({
  discordId: z.string().regex(/^\d{5,25}$/),
  username: z.string().min(1).max(64),
  guildIds: z.array(z.string().regex(/^\d{5,25}$/)).default([]),
});

function devLoginEnabled(): boolean {
  const settings = config();
  const allowedEnvironment =
    settings.ENVIRONMENT === 'development' || settings.ENVIRONMENT === 'test' || settings.isTest;
  return settings.ALLOW_DEV_LOGIN && allowedEnvironment && !settings.isProduction;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!devLoginEnabled()) {
    // 404 rather than 403: in production this route should look absent.
    return new NextResponse('Not found', { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid dev login payload.' }, { status: 400 });
  }

  const { discordId, username, guildIds } = parsed.data;

  // Dev login can only join servers Couchlist already knows about, exactly
  // like the real flow.
  const { guilds } = repos();
  const summaries = [];
  for (const guildId of guildIds) {
    const guild = await guilds.findByDiscordId(guildId);
    if (guild) {
      summaries.push({ id: guildId, name: guild.name, iconUrl: guild.iconUrl, canManage: false });
    }
  }

  const result = await completeLogin(
    { id: discordId, username, globalName: username, avatarUrl: null },
    summaries,
  );

  if (!result.ok) {
    log.info('dev_login_rejected', { reason: result.reason });
    return NextResponse.json({ error: 'Not on the test allowlist.' }, { status: 403 });
  }

  log.warn('dev_login_used', { userId: result.userId });
  return NextResponse.json({ ok: true, userId: result.userId });
}
