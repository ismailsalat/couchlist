import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guards';
import { repos } from '@/lib/db';
import { refreshGuildMembershipsIfStale } from '@/lib/services/guild-membership';

export const dynamic = 'force-dynamic';

/** Manual escape hatch for a user who just joined/left a server and wants it now. */
export async function POST(): Promise<NextResponse> {
  const user = await requireUser();
  const result = await refreshGuildMembershipsIfStale(user, { force: true });
  const guilds = await repos().guilds.activeGuildsForUser(user.id);
  return NextResponse.json({
    ok: true,
    refreshed: result.refreshed,
    reason: result.reason ?? null,
    guildCount: guilds.length,
  });
}
