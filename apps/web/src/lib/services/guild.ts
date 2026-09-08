import 'server-only';
import { repos } from '../db';
import { visibleMemberIds } from '../api/guards';

/** Everything the optional server hub shows, scoped to that server's members. */
export interface GuildPageData {
  guild: { id: string; discordId: string; name: string; iconUrl: string | null };
  memberCount: number;
  members: GuildMemberPreview[];
  currentlyWatching: TitleTally[];
  highestRated: TitleTally[];
  wantToWatch: TitleTally[];
}

export interface GuildMemberPreview {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  watching: string | null;
}

export interface TitleTally {
  provider: 'ANILIST' | 'JIKAN' | 'KITSU' | 'TMDB';
  providerMediaId: string;
  mediaType: 'ANIME' | 'MOVIE' | 'TV';
  title: string;
  posterUrl: string | null;
  count: number;
  averageRating: number | null;
}

export async function buildGuildPage(
  viewerId: string,
  guildId: string,
): Promise<GuildPageData | null> {
  const { guilds, entries, users } = repos();

  const guild = await guilds.findById(guildId);
  if (!guild || !guild.botConnected) return null;

  const memberIds = await visibleMemberIds(viewerId, guildId);
  const [rows, memberUsers, activity] = await Promise.all([
    entries.listForUsers(memberIds),
    users.findManyByIds(memberIds),
    entries.recentActivity(memberIds, Math.max(memberIds.length * 2, 20)),
  ]);

  const latestByUser = new Map<string, (typeof activity)[number]>();
  for (const row of activity) {
    if (!latestByUser.has(row.userId)) latestByUser.set(row.userId, row);
  }

  const members: GuildMemberPreview[] = memberUsers
    .map((member) => ({
      id: member.id,
      username: member.username,
      globalName: member.globalName,
      avatarUrl: member.avatarUrl,
      watching: latestByUser.get(member.id)?.title ?? null,
    }))
    .sort((a, b) => (a.globalName ?? a.username).localeCompare(b.globalName ?? b.username));

  const tally = new Map<string, TitleTally & { ratings: number[]; statuses: string[] }>();
  for (const row of rows) {
    const key = `${row.provider}:${row.mediaType}:${row.providerMediaId}`;
    const existing = tally.get(key) ?? {
      provider: row.provider,
      providerMediaId: row.providerMediaId,
      mediaType: row.mediaType,
      title: row.title,
      posterUrl: row.posterUrl,
      count: 0,
      averageRating: null,
      ratings: [],
      statuses: [],
    };
    existing.count += 1;
    existing.statuses.push(row.status);
    if (row.rating !== null) existing.ratings.push(row.rating);
    if (!existing.posterUrl && row.posterUrl) existing.posterUrl = row.posterUrl;
    tally.set(key, existing);
  }

  const all = [...tally.values()].map((item) => ({
    ...item,
    averageRating:
      item.ratings.length > 0
        ? Number((item.ratings.reduce((a, b) => a + b, 0) / item.ratings.length).toFixed(1))
        : null,
  }));

  const byStatus = (status: string) =>
    all
      .map((item) => ({ ...item, count: item.statuses.filter((s) => s === status).length }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
      .slice(0, 5)
      .map(strip);

  return {
    guild: {
      id: guild.id,
      discordId: guild.discordId,
      name: guild.name,
      iconUrl: guild.iconUrl,
    },
    memberCount: memberIds.length,
    members,
    currentlyWatching: byStatus('WATCHING'),
    wantToWatch: byStatus('PLAN_TO_WATCH'),
    highestRated: all
      .filter((item) => item.ratings.length > 0)
      .sort(
        (a, b) =>
          (b.averageRating ?? 0) - (a.averageRating ?? 0) || a.title.localeCompare(b.title),
      )
      .slice(0, 5)
      .map(strip),
  };
}

function strip(item: TitleTally & { ratings: number[]; statuses: string[] }): TitleTally {
  return {
    provider: item.provider,
    providerMediaId: item.providerMediaId,
    mediaType: item.mediaType,
    title: item.title,
    posterUrl: item.posterUrl,
    count: item.count,
    averageRating: item.averageRating,
  };
}
