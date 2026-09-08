import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createDatabase } from '../client.js';
import {
  EntryRepository,
  FriendRepository,
  GuildRepository,
  UserRepository,
} from '../repositories/index.js';
import { runMigrations } from '../migrate.js';
import { assertNotProduction } from './guard.js';
import { loadProjectEnv } from '../load-env.js';

/**
 * Development seed.
 *
 * Creates two obviously fake accounts in one shared server with a handful of
 * titles, so the whole product - friends, server stats, comparison and Watch
 * Together - can be exercised locally without live Discord.
 */
const FAKE_GUILD = { discordId: '900000000000000001', name: 'Test Server' };

const FAKE_USERS = [
  { discordId: '900000000000000101', username: 'test-user', globalName: 'Test User' },
  { discordId: '900000000000000102', username: 'test-alt', globalName: 'Test Alt' },
];

const TITLES = {
  attackOnTitan: {
    provider: 'ANILIST' as const,
    providerMediaId: '16498',
    mediaType: 'ANIME' as const,
    canonicalMediaKey: 'mal:16498',
    title: 'Attack on Titan',
  },
  frieren: {
    provider: 'ANILIST' as const,
    providerMediaId: '154587',
    mediaType: 'ANIME' as const,
    canonicalMediaKey: 'mal:52991',
    title: 'Frieren: Beyond Journey\u2019s End',
  },
  vinland: {
    provider: 'ANILIST' as const,
    providerMediaId: '101348',
    mediaType: 'ANIME' as const,
    canonicalMediaKey: 'mal:37521',
    title: 'Vinland Saga',
  },
  interstellar: {
    provider: 'TMDB' as const,
    providerMediaId: '157336',
    mediaType: 'MOVIE' as const,
    title: 'Interstellar',
  },
  breakingBad: {
    provider: 'TMDB' as const,
    providerMediaId: '1396',
    mediaType: 'TV' as const,
    title: 'Breaking Bad',
  },
};

export async function seed(connectionString: string): Promise<void> {
  const db = createDatabase({ connectionString, ssl: false });
  const users = new UserRepository(db);
  const guilds = new GuildRepository(db);
  const friends = new FriendRepository(db);
  const entries = new EntryRepository(db);

  const guild = await guilds.upsert(FAKE_GUILD);
  await guilds.setBotConnected(FAKE_GUILD.discordId, true);
  await guilds.ensureSettings(guild.id);

  const [main, alt] = await Promise.all(FAKE_USERS.map((user) => users.upsertFromDiscord(user)));

  for (const user of [main!, alt!]) {
    await guilds.syncMemberships(user.id, [FAKE_GUILD.discordId]);
  }

  // Direct Couchlist friendship: the social layer keeps working even if the
  // test server is later disconnected.
  await friends.request(main!.id, alt!.id);
  await friends.accept(alt!.id, main!.id);

  // Overlapping ratings so taste match has something to work with, plus
  // overlapping plan-to-watch so Watch Together returns a result.
  await entries.upsert({
    userId: main!.id,
    ...TITLES.attackOnTitan,
    status: 'COMPLETED',
    rating: 9,
  });
  await entries.upsert({ userId: main!.id, ...TITLES.interstellar, status: 'COMPLETED', rating: 9 });
  await entries.upsert({ userId: main!.id, ...TITLES.breakingBad, status: 'COMPLETED', rating: 8 });
  await entries.upsert({
    userId: main!.id,
    ...TITLES.frieren,
    status: 'WATCHING',
    progress: 8,
  });
  await entries.upsert({ userId: main!.id, ...TITLES.vinland, status: 'PLAN_TO_WATCH' });

  await entries.upsert({ userId: alt!.id, ...TITLES.attackOnTitan, status: 'COMPLETED', rating: 7 });
  await entries.upsert({ userId: alt!.id, ...TITLES.interstellar, status: 'COMPLETED', rating: 10 });
  await entries.upsert({ userId: alt!.id, ...TITLES.breakingBad, status: 'COMPLETED', rating: 9 });
  await entries.upsert({ userId: alt!.id, ...TITLES.vinland, status: 'PLAN_TO_WATCH' });
  await entries.upsert({ userId: alt!.id, ...TITLES.frieren, status: 'PLAN_TO_WATCH' });

  process.stdout.write(
    [
      '',
      'Seeded Couchlist with development data:',
      `  Server:  ${FAKE_GUILD.name} (${FAKE_GUILD.discordId})`,
      `  Users:   ${FAKE_USERS.map((user) => user.globalName).join(', ')}`,
      '  Titles:  5 across anime, movie and TV',
      '',
      'Sign in with the dev login to use these accounts.',
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  loadProjectEnv();
  assertNotProduction('seed the database');

  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write('\nDATABASE_URL is not set.\n\n');
    process.exit(1);
  }

  await runMigrations(url);
  await seed(url);
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}

export { FAKE_GUILD, FAKE_USERS };
