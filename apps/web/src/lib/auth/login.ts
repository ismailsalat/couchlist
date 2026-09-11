import 'server-only';
import { isGuildAllowed, isUserAllowed } from '@couchlist/shared';
import type { DiscordGuildSummary, DiscordUser } from './discord';
import { config } from '../config';
import { repos } from '../db';
import { createSession } from './session';

/**
 * The shared tail of every login path.
 *
 * Both real Discord OAuth and the development login funnel through here, so
 * the test-mode allowlist and guild sync can only be applied one way.
 */
export interface LoginResult {
  ok: boolean;
  userId?: string;
  reason?: 'not_allowed';
}

export async function completeLogin(
  profile: DiscordUser,
  guilds: DiscordGuildSummary[],
): Promise<LoginResult> {
  // Test-mode allowlist is checked before anything is written.
  if (!isUserAllowed(config(), profile.id)) {
    return { ok: false, reason: 'not_allowed' };
  }

  const { users, guilds: guildRepo } = repos();

  const user = await users.upsertFromDiscord({
    discordId: profile.id,
    username: profile.username,
    globalName: profile.globalName,
    avatarUrl: profile.avatarUrl,
  });

  // Only servers where Couchlist is actually installed become memberships.
  // A user being in a server the bot is not in must not create a Couchlist
  // guild, or people could see servers Couchlist knows nothing about.
  const known = await Promise.all(
    guilds.map(async (guild) => {
      // Test mode is a hard boundary: even if Couchlist knows about another
      // server, a tester is only linked to explicitly allowlisted guilds.
      if (!isGuildAllowed(config(), guild.id)) return null;

      const existing = await guildRepo.findByDiscordId(guild.id);
      if (existing?.botConnected) {
        await guildRepo.upsert({ discordId: guild.id, name: guild.name, iconUrl: guild.iconUrl });
        return guild.id;
      }
      return null;
    }),
  );

  await guildRepo.syncMemberships(
    user.id,
    known.filter((id): id is string => id !== null),
  );

  await users.markGuildsSynced(user.id);
  await users.touchLastSeen(user.id);
  await createSession(user.id);

  return { ok: true, userId: user.id };
}
