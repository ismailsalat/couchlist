import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@couchlist/db';
import { nextDiscordId, repositories, resetTables, setupTestDatabase } from '../helpers/db';

let db: Database;
let repos: ReturnType<typeof repositories>;

beforeAll(async () => {
  db = await setupTestDatabase();
  repos = repositories(db);
});

beforeEach(async () => {
  await resetTables(db);
});

async function makeUser(name: string) {
  return repos.users.upsertFromDiscord({ discordId: nextDiscordId(), username: name });
}

async function makeGuild(name: string) {
  const discordId = nextDiscordId();
  const guild = await repos.guilds.upsert({ discordId, name });
  await repos.guilds.setBotConnected(discordId, true);
  await repos.guilds.ensureSettings(guild.id);
  return { ...guild, discordId };
}

describe('guild membership', () => {
  it('records membership on sync', async () => {
    const user = await makeUser('a');
    const guild = await makeGuild('Bidhaar');

    await repos.guilds.syncMemberships(user.id, [guild.discordId]);

    expect(await repos.guilds.isMember(user.id, guild.id)).toBe(true);
    expect(await repos.guilds.activeGuildsForUser(user.id)).toHaveLength(1);
  });

  it('deactivates membership when a user leaves a server', async () => {
    const user = await makeUser('a');
    const guild = await makeGuild('Bidhaar');

    await repos.guilds.syncMemberships(user.id, [guild.discordId]);
    // Next login reports no guilds - they left.
    const result = await repos.guilds.syncMemberships(user.id, []);

    expect(result.deactivated).toBe(1);
    expect(await repos.guilds.isMember(user.id, guild.id)).toBe(false);
    expect(await repos.guilds.activeGuildsForUser(user.id)).toHaveLength(0);
  });

  it('restores membership when a user rejoins', async () => {
    const user = await makeUser('a');
    const guild = await makeGuild('Bidhaar');

    await repos.guilds.syncMemberships(user.id, [guild.discordId]);
    await repos.guilds.syncMemberships(user.id, []);
    await repos.guilds.syncMemberships(user.id, [guild.discordId]);

    expect(await repos.guilds.isMember(user.id, guild.id)).toBe(true);
  });

  it('ignores servers Couchlist does not know about', async () => {
    const user = await makeUser('a');
    // A Discord server the bot was never added to.
    await repos.guilds.syncMemberships(user.id, [nextDiscordId()]);
    expect(await repos.guilds.activeGuildsForUser(user.id)).toHaveLength(0);
  });

  it('keeps personal lists when the bot is removed from a server', async () => {
    const user = await makeUser('a');
    const guild = await makeGuild('Bidhaar');
    await repos.guilds.syncMemberships(user.id, [guild.discordId]);

    await repos.entries.upsert({
      userId: user.id,
      provider: 'ANILIST',
      providerMediaId: '16498',
      mediaType: 'ANIME',
      status: 'COMPLETED',
      rating: 9,
      title: 'Attack on Titan',
    });

    await repos.guilds.setBotConnected(guild.discordId, false);

    const stored = await repos.guilds.findByDiscordId(guild.discordId);
    expect(stored?.botConnected).toBe(false);
    // The user's own data is untouched.
    expect(await repos.entries.listForUser(user.id)).toHaveLength(1);
  });
});

describe('direct Couchlist friends', () => {
  it('lets two users become friends without a shared Discord server', async () => {
    const [one, two] = [await makeUser('one'), await makeUser('two')];

    const request = await repos.friends.request(one.id, two.id);
    expect(request.status).toBe('PENDING');
    expect(await repos.friends.areFriends(one.id, two.id)).toBe(false);

    expect(await repos.friends.accept(two.id, one.id)).toBe(true);
    expect(await repos.friends.areFriends(one.id, two.id)).toBe(true);
    expect((await repos.friends.acceptedFriendIds(one.id))).toEqual([two.id]);
  });

  it('does not let the requester accept their own request', async () => {
    const [one, two] = [await makeUser('one'), await makeUser('two')];
    await repos.friends.request(one.id, two.id);
    expect(await repos.friends.accept(one.id, two.id)).toBe(false);
  });

  it('removes a friendship cleanly', async () => {
    const [one, two] = [await makeUser('one'), await makeUser('two')];
    await repos.friends.request(one.id, two.id);
    await repos.friends.accept(two.id, one.id);
    expect(await repos.friends.remove(one.id, two.id)).toBe(true);
    expect(await repos.friends.areFriends(one.id, two.id)).toBe(false);
  });
});

describe('shared servers', () => {
  it('finds guilds two users both belong to', async () => {
    const [one, two] = [await makeUser('one'), await makeUser('two')];
    const shared = await makeGuild('Shared');
    const onlyOne = await makeGuild('Solo');

    await repos.guilds.syncMemberships(one.id, [shared.discordId, onlyOne.discordId]);
    await repos.guilds.syncMemberships(two.id, [shared.discordId]);

    const result = await repos.guilds.sharedGuildIds(one.id, two.id);
    expect(result).toEqual([shared.id]);
  });

  it('returns nothing for users with no server in common', async () => {
    const [one, two] = [await makeUser('one'), await makeUser('two')];
    const first = await makeGuild('First');
    const second = await makeGuild('Second');

    await repos.guilds.syncMemberships(one.id, [first.discordId]);
    await repos.guilds.syncMemberships(two.id, [second.discordId]);

    expect(await repos.guilds.sharedGuildIds(one.id, two.id)).toEqual([]);
  });

  it('stops counting a guild once someone leaves it', async () => {
    const [one, two] = [await makeUser('one'), await makeUser('two')];
    const guild = await makeGuild('Shared');

    await repos.guilds.syncMemberships(one.id, [guild.discordId]);
    await repos.guilds.syncMemberships(two.id, [guild.discordId]);
    expect(await repos.guilds.sharedGuildIds(one.id, two.id)).toEqual([guild.id]);

    await repos.guilds.syncMemberships(two.id, []);
    expect(await repos.guilds.sharedGuildIds(one.id, two.id)).toEqual([]);
  });

  it('lists only active members of a guild', async () => {
    const [one, two] = [await makeUser('one'), await makeUser('two')];
    const guild = await makeGuild('Shared');

    await repos.guilds.syncMemberships(one.id, [guild.discordId]);
    await repos.guilds.syncMemberships(two.id, [guild.discordId]);
    await repos.guilds.syncMemberships(two.id, []);

    const members = await repos.guilds.membersOf(guild.id);
    expect(members.map((member) => member.id)).toEqual([one.id]);
  });
});

describe('privacy', () => {
  it('defaults to mutual servers with ratings and progress shown', async () => {
    const user = await makeUser('a');
    expect(user.profileVisibility).toBe('MUTUAL_SERVERS');
    expect(user.showRatings).toBe(true);
    expect(user.showProgress).toBe(true);
  });

  it('stores privacy changes', async () => {
    const user = await makeUser('a');
    const updated = await repos.users.updatePrivacy(user.id, {
      profileVisibility: 'PRIVATE',
      showRatings: false,
    });

    expect(updated?.profileVisibility).toBe('PRIVATE');
    expect(updated?.showRatings).toBe(false);
    expect(updated?.showProgress).toBe(true);
  });
});

describe('account lifecycle', () => {
  it('exports a user\'s own data', async () => {
    const user = await makeUser('a');
    const guild = await makeGuild('Bidhaar');
    await repos.guilds.syncMemberships(user.id, [guild.discordId]);
    await repos.entries.upsert({
      userId: user.id,
      provider: 'ANILIST',
      providerMediaId: '1',
      mediaType: 'ANIME',
      status: 'COMPLETED',
      title: 'Something',
    });

    const data = await repos.users.exportData(user.id);
    expect(data.profile?.id).toBe(user.id);
    expect(data.entries).toHaveLength(1);
    expect(data.memberships).toHaveLength(1);
    // The export must never contain session material.
    expect(JSON.stringify(data)).not.toContain('tokenHash');
  });

  it('deletes an account and its lists', async () => {
    const user = await makeUser('a');
    await repos.entries.upsert({
      userId: user.id,
      provider: 'ANILIST',
      providerMediaId: '1',
      mediaType: 'ANIME',
      status: 'COMPLETED',
      title: 'Something',
    });

    expect(await repos.users.deleteAccount(user.id)).toBe(true);
    expect(await repos.users.findById(user.id)).toBeUndefined();
    expect(await repos.entries.listForUser(user.id)).toHaveLength(0);
  });

  it('keeps audit rows after the actor is deleted', async () => {
    const user = await makeUser('a');
    const guild = await makeGuild('Bidhaar');

    await repos.audit.record({ actorId: user.id, guildId: guild.id, action: 'guild.setup' });
    await repos.users.deleteAccount(user.id);

    const logs = await repos.audit.listForGuild(guild.id);
    expect(logs).toHaveLength(1);
    // The trail survives, but no longer names anyone.
    expect(logs[0]?.actorId).toBeNull();
  });
});

describe('audit logging', () => {
  it('never stores secret-looking metadata', async () => {
    const guild = await makeGuild('Bidhaar');

    const row = await repos.audit.record({
      guildId: guild.id,
      action: 'guild.setup',
      metadata: {
        guildName: 'Bidhaar',
        botToken: 'super-secret',
        apiKey: 'nope',
        nested: { password: 'no' },
      },
    });

    const stored = JSON.stringify(row.metadata);
    expect(stored).toContain('Bidhaar');
    expect(stored).not.toContain('super-secret');
    expect(stored).not.toContain('nope');
  });
});

describe('media cache', () => {
  it('returns a cached payload while fresh', async () => {
    const identity = { provider: 'ANILIST', providerMediaId: '16498', mediaType: 'ANIME' } as const;
    await repos.cache.set(
      identity,
      { title: 'Attack on Titan', year: 2013, posterUrl: null, bannerUrl: null },
      { title: 'Attack on Titan' },
      24,
    );

    expect(await repos.cache.get(identity)).toEqual({ title: 'Attack on Titan' });
  });

  it('ignores an expired payload', async () => {
    const identity = { provider: 'ANILIST', providerMediaId: '2', mediaType: 'ANIME' } as const;
    await repos.cache.set(
      identity,
      { title: 'Old', year: null, posterUrl: null, bannerUrl: null },
      { title: 'Old' },
      -1,
    );

    expect(await repos.cache.get(identity)).toBeUndefined();
    expect(await repos.cache.purgeExpired()).toBe(1);
  });
});
