import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@couchlist/db';
import {
  nextDiscordId,
  repositories,
  resetTables,
  setupTestDatabase,
} from '../helpers/db';

let db: Database;
let repos: ReturnType<typeof repositories>;

beforeAll(async () => {
  db = await setupTestDatabase();
  repos = repositories(db);
});

beforeEach(async () => {
  await resetTables(db);
});

async function makeUser(name = 'tester') {
  return repos.users.upsertFromDiscord({ discordId: nextDiscordId(), username: name });
}

const AOT = { provider: 'ANILIST', providerMediaId: '16498', mediaType: 'ANIME' } as const;

describe('media entries', () => {
  it('adds a title to a list', async () => {
    const user = await makeUser();
    const entry = await repos.entries.upsert({
      userId: user.id,
      ...AOT,
      status: 'WATCHING',
      title: 'Attack on Titan',
      progress: 3,
    });

    expect(entry.status).toBe('WATCHING');
    expect(entry.progress).toBe(3);
  });

  it('blocks duplicates at the database level', async () => {
    const user = await makeUser();

    await repos.entries.upsert({
      userId: user.id,
      ...AOT,
      status: 'WATCHING',
      title: 'Attack on Titan',
    });

    // A raw insert bypassing the upsert must be rejected by the unique index.
    await expect(
      db.execute(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (await import('drizzle-orm')).sql`insert into media_entries
          (id, user_id, provider, provider_media_id, media_type, status, title)
          values ('ent_dup', ${user.id}, 'ANILIST', '16498', 'ANIME', 'COMPLETED', 'Duplicate')`,
      ),
    ).rejects.toThrow();

    expect(await repos.entries.listForUser(user.id)).toHaveLength(1);
  });

  it('upserting the same title updates rather than duplicating', async () => {
    const user = await makeUser();

    await repos.entries.upsert({ userId: user.id, ...AOT, status: 'WATCHING', title: 'AoT' });
    await repos.entries.upsert({
      userId: user.id,
      ...AOT,
      status: 'COMPLETED',
      rating: 9,
      title: 'AoT',
    });

    const entries = await repos.entries.listForUser(user.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe('COMPLETED');
    expect(entries[0]?.rating).toBe(9);
  });

  it('allows two users to track the same title', async () => {
    const one = await makeUser('one');
    const two = await makeUser('two');

    await repos.entries.upsert({ userId: one.id, ...AOT, status: 'COMPLETED', title: 'AoT' });
    await repos.entries.upsert({ userId: two.id, ...AOT, status: 'WATCHING', title: 'AoT' });

    expect(await repos.entries.listForUser(one.id)).toHaveLength(1);
    expect(await repos.entries.listForUser(two.id)).toHaveLength(1);
  });

  it('allows the same provider id across different media types', async () => {
    const user = await makeUser();

    await repos.entries.upsert({
      userId: user.id,
      provider: 'TMDB',
      providerMediaId: '1396',
      mediaType: 'MOVIE',
      status: 'COMPLETED',
      title: 'A Movie',
    });
    await repos.entries.upsert({
      userId: user.id,
      provider: 'TMDB',
      providerMediaId: '1396',
      mediaType: 'TV',
      status: 'WATCHING',
      title: 'Breaking Bad',
    });

    expect(await repos.entries.listForUser(user.id)).toHaveLength(2);
  });

  it('updates progress and rating', async () => {
    const user = await makeUser();
    await repos.entries.upsert({ userId: user.id, ...AOT, status: 'WATCHING', title: 'AoT' });

    const updated = await repos.entries.update(user.id, AOT, { progress: 12, rating: 8.5 });
    expect(updated?.progress).toBe(12);
    expect(updated?.rating).toBe(8.5);
  });

  it('will not update another user\'s entry', async () => {
    const owner = await makeUser('owner');
    const attacker = await makeUser('attacker');

    await repos.entries.upsert({ userId: owner.id, ...AOT, status: 'WATCHING', title: 'AoT' });

    // Same media identity, different user - must not match anything.
    const result = await repos.entries.update(attacker.id, AOT, { rating: 1 });
    expect(result).toBeUndefined();

    const untouched = await repos.entries.find(owner.id, AOT);
    expect(untouched?.rating).toBeNull();
  });

  it('will not delete another user\'s entry', async () => {
    const owner = await makeUser('owner');
    const attacker = await makeUser('attacker');
    await repos.entries.upsert({ userId: owner.id, ...AOT, status: 'WATCHING', title: 'AoT' });

    expect(await repos.entries.remove(attacker.id, AOT)).toBe(false);
    expect(await repos.entries.find(owner.id, AOT)).toBeDefined();
  });

  it('removes an entry', async () => {
    const user = await makeUser();
    await repos.entries.upsert({ userId: user.id, ...AOT, status: 'WATCHING', title: 'AoT' });

    expect(await repos.entries.remove(user.id, AOT)).toBe(true);
    expect(await repos.entries.find(user.id, AOT)).toBeUndefined();
  });

  it('counts entries by status', async () => {
    const user = await makeUser();
    await repos.entries.upsert({ userId: user.id, ...AOT, status: 'WATCHING', title: 'A' });
    await repos.entries.upsert({
      userId: user.id,
      provider: 'TMDB',
      providerMediaId: '1',
      mediaType: 'MOVIE',
      status: 'COMPLETED',
      title: 'B',
    });
    await repos.entries.upsert({
      userId: user.id,
      provider: 'TMDB',
      providerMediaId: '2',
      mediaType: 'MOVIE',
      status: 'COMPLETED',
      title: 'C',
    });

    expect(await repos.entries.countsByStatus(user.id)).toEqual({
      WATCHING: 1,
      COMPLETED: 2,
      PLAN_TO_WATCH: 0,
    });
  });

  it('aggregates ratings for a title', async () => {
    const one = await makeUser('one');
    const two = await makeUser('two');
    const three = await makeUser('three');

    await repos.entries.upsert({ userId: one.id, ...AOT, status: 'COMPLETED', rating: 9, title: 'AoT' });
    await repos.entries.upsert({ userId: two.id, ...AOT, status: 'COMPLETED', rating: 7, title: 'AoT' });
    await repos.entries.upsert({ userId: three.id, ...AOT, status: 'WATCHING', title: 'AoT' });

    const stats = await repos.entries.statsForMedia([one.id, two.id, three.id], AOT);
    expect(stats.completed).toBe(2);
    expect(stats.watching).toBe(1);
    expect(stats.averageRating).toBe(8);
    expect(stats.ratingCount).toBe(2);
  });

  it('scopes statistics to the users given', async () => {
    const inside = await makeUser('inside');
    const outside = await makeUser('outside');

    await repos.entries.upsert({ userId: inside.id, ...AOT, status: 'COMPLETED', rating: 10, title: 'AoT' });
    await repos.entries.upsert({ userId: outside.id, ...AOT, status: 'COMPLETED', rating: 2, title: 'AoT' });

    const stats = await repos.entries.statsForMedia([inside.id], AOT);
    expect(stats.averageRating).toBe(10);
    expect(stats.completed).toBe(1);
  });

  it('survives a reconnect, proving data is persisted', async () => {
    const user = await makeUser();
    await repos.entries.upsert({ userId: user.id, ...AOT, status: 'COMPLETED', rating: 9, title: 'AoT' });

    // A brand new pool, as a redeploy would create.
    const { createDatabase, EntryRepository } = await import('@couchlist/db');
    const { TEST_DATABASE_URL } = await import('../helpers/db');
    const fresh = createDatabase({ connectionString: TEST_DATABASE_URL, ssl: false });

    const found = await new EntryRepository(fresh).find(user.id, AOT);
    expect(found?.rating).toBe(9);
  });
});
