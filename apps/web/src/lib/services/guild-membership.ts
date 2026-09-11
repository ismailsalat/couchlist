import 'server-only';
import { isGuildAllowed, type CouchlistConfig } from '@couchlist/shared';
import type { DiscordGuildRow, User } from '@couchlist/db';
import { config } from '../config';
import { repos } from '../db';

const DISCORD_API = 'https://discord.com/api/v10';
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const CHECK_CONCURRENCY = 4;

type MemberState = 'MEMBER' | 'NOT_MEMBER' | 'UNKNOWN';

export interface GuildRefreshResult {
  refreshed: boolean;
  active: number;
  deactivated: number;
  reason?: 'fresh' | 'test_mode' | 'bot_token_missing' | 'discord_unavailable';
}

/** Pure status mapping kept exported so it is cheap to regression-test. */
export function memberStateFromStatus(status: number): MemberState {
  if (status >= 200 && status < 300) return 'MEMBER';
  if (status === 404) return 'NOT_MEMBER';
  return 'UNKNOWN';
}

/**
 * Refresh one user's membership across servers where Couchlist is installed.
 *
 * This deliberately uses the bot's exact-member REST endpoint instead of
 * storing a user's Discord OAuth access token. It detects both joins and leaves,
 * keeps the session untouched, and only replaces memberships after every check
 * returned a definite answer. A partial Discord outage can therefore never
 * accidentally kick somebody out of all of their servers.
 */
export async function refreshGuildMembershipsIfStale(
  user: User,
  options: {
    force?: boolean;
    now?: Date;
    ttlMs?: number;
    fetchImpl?: typeof fetch;
    settings?: CouchlistConfig;
  } = {},
): Promise<GuildRefreshResult> {
  const settings = options.settings ?? config();
  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  // Test/dev fixtures own their memberships explicitly. Do not leak tests onto
  // the live Discord API or rewrite seeded memberships underneath Playwright.
  if (settings.TEST_MODE) {
    return { refreshed: false, active: 0, deactivated: 0, reason: 'test_mode' };
  }

  if (!options.force && user.guildsSyncedAt && now.getTime() - user.guildsSyncedAt.getTime() < ttlMs) {
    return { refreshed: false, active: 0, deactivated: 0, reason: 'fresh' };
  }

  const token = settings.DISCORD_BOT_TOKEN.trim();
  if (!token) {
    return { refreshed: false, active: 0, deactivated: 0, reason: 'bot_token_missing' };
  }

  const { guilds, users } = repos();
  const connected = (await guilds.listConnectedGuilds()).filter((guild) =>
    isGuildAllowed(settings, guild.discordId),
  );

  const fetchImpl = options.fetchImpl ?? fetch;
  const states = await mapWithConcurrency(connected, CHECK_CONCURRENCY, (guild) =>
    checkMembership(guild, user.discordId, token, fetchImpl),
  );

  // If even one guild could not be confirmed, keep the existing membership set.
  // This is intentionally fail-safe during Discord outages/rate limiting.
  if (states.some((entry) => entry.state === 'UNKNOWN')) {
    return { refreshed: false, active: 0, deactivated: 0, reason: 'discord_unavailable' };
  }

  const activeGuildIds = states
    .filter((entry) => entry.state === 'MEMBER')
    .map((entry) => entry.guild.discordId);
  const result = await guilds.syncMemberships(user.id, activeGuildIds);
  await users.markGuildsSynced(user.id, now);

  return { refreshed: true, ...result };
}

async function checkMembership(
  guild: DiscordGuildRow,
  discordUserId: string,
  botToken: string,
  fetchImpl: typeof fetch,
): Promise<{ guild: DiscordGuildRow; state: MemberState }> {
  const url = `${DISCORD_API}/guilds/${encodeURIComponent(guild.discordId)}/members/${encodeURIComponent(discordUserId)}`;

  try {
    const response = await fetchImpl(url, {
      headers: { authorization: `Bot ${botToken}` },
      cache: 'no-store',
    });
    return { guild, state: memberStateFromStatus(response.status) };
  } catch {
    return { guild, state: 'UNKNOWN' };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index] as T);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}
