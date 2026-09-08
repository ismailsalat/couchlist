import 'server-only';
import { isUserAllowed } from '@couchlist/shared';
import type { User } from '@couchlist/db';
import { config } from '../config';
import { repos } from '../db';

/**
 * Couchlist's social layer is independent of Discord servers.
 *
 * Discord does not expose a normal user's real Discord friends list here.
 * Instead, people explicitly connect on Couchlist. Connected Discord servers
 * are optional community hubs and a discovery source, not the friendship model.
 */
export interface FriendCard {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  sharedServers: Array<{ discordId: string; name: string }>;
  watching: {
    title: string;
    provider: 'ANILIST' | 'TMDB';
    mediaType: 'ANIME' | 'MOVIE' | 'TV';
    providerMediaId: string;
    progress: number | null;
    updatedAt: string;
  } | null;
}

export interface PendingFriendCard {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  direction: 'incoming' | 'outgoing';
  sharedServers: Array<{ discordId: string; name: string }>;
}

export interface PersonSuggestion {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  sharedServers: Array<{ discordId: string; name: string }>;
  relationship: 'none' | 'incoming' | 'outgoing' | 'accepted';
}

export async function listFriends(viewer: User): Promise<FriendCard[]> {
  const { friends, entries } = repos();
  const people = await friends.acceptedFriends(viewer.id);
  if (people.length === 0) return [];

  const ids = people.map((person) => person.id);
  const activity = await entries.recentActivity(ids, Math.max(ids.length * 3, 20));
  const latestByUser = new Map<string, (typeof activity)[number]>();
  for (const row of activity) {
    if (!latestByUser.has(row.userId)) latestByUser.set(row.userId, row);
  }

  return Promise.all(
    people.map(async (friend) => {
      const current = latestByUser.get(friend.id);
      return {
        id: friend.id,
        username: friend.username,
        globalName: friend.globalName,
        avatarUrl: friend.avatarUrl,
        sharedServers: await sharedServerLabels(viewer.id, friend.id),
        watching: current
          ? {
              title: current.title,
              provider: current.provider,
              mediaType: current.mediaType,
              providerMediaId: current.providerMediaId,
              progress: friend.showProgress ? current.progress : null,
              updatedAt: current.updatedAt.toISOString(),
            }
          : null,
      };
    }),
  ).then((cards) =>
    cards.sort((left, right) =>
      (left.globalName ?? left.username).localeCompare(right.globalName ?? right.username),
    ),
  );
}

export async function listPendingFriends(viewer: User): Promise<PendingFriendCard[]> {
  const pending = await repos().friends.pendingFor(viewer.id);
  return Promise.all(
    pending.map(async ({ other, direction }) => ({
      id: other.id,
      username: other.username,
      globalName: other.globalName,
      avatarUrl: other.avatarUrl,
      direction,
      sharedServers: await sharedServerLabels(viewer.id, other.id),
    })),
  );
}

/**
 * Find people by Couchlist/Discord display name, or suggest people from an
 * optional connected server. Search works even when the viewer has no server.
 */
export async function findPeople(viewer: User, query?: string): Promise<PersonSuggestion[]> {
  const { users, guilds, friends } = repos();
  let people: User[] = [];

  if (query?.trim() && query.trim().length >= 2) {
    people = await users.searchByName(query, viewer.id, 12);
  } else {
    const seen = new Map<string, User>();
    for (const guild of await guilds.activeGuildsForUser(viewer.id)) {
      for (const person of await guilds.membersOf(guild.id)) {
        if (person.id !== viewer.id) seen.set(person.id, person);
      }
    }
    people = [...seen.values()].slice(0, 12);
  }

  // A stale seeded/non-allowlisted test account should never appear during a
  // private test just because it happens to remain in the database.
  people = people.filter((person) => isUserAllowed(config(), person.discordId));

  return Promise.all(
    people.map(async (person) => {
      const relation = await friends.relationship(viewer.id, person.id);
      const relationship: PersonSuggestion['relationship'] =
        relation?.status === 'ACCEPTED'
          ? 'accepted'
          : relation?.status === 'PENDING'
            ? relation.requestedByUserId === viewer.id
              ? 'outgoing'
              : 'incoming'
            : 'none';

      return {
        id: person.id,
        username: person.username,
        globalName: person.globalName,
        avatarUrl: person.avatarUrl,
        sharedServers: await sharedServerLabels(viewer.id, person.id),
        relationship,
      };
    }),
  );
}

async function sharedServerLabels(
  viewerId: string,
  otherUserId: string,
): Promise<Array<{ discordId: string; name: string }>> {
  const { guilds } = repos();
  const ids = await guilds.sharedGuildIds(viewerId, otherUserId);
  const rows = await Promise.all(ids.map((id) => guilds.findById(id)));
  return rows
    .filter((guild): guild is NonNullable<typeof guild> => Boolean(guild?.botConnected))
    .map((guild) => ({ discordId: guild.discordId, name: guild.name }));
}
