import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../client.js';
import { runMigrations } from '../migrate.js';
import { assertNotProduction } from './guard.js';
import { loadProjectEnv } from '../load-env.js';
import { GUIDE_SEED } from '../guide-seed.js';
import { guides } from '../schema.js';

/**
 * Development seed.
 *
 * Fills a local database with enough to see the product working: the starter
 * guides, a handful of example sources across every category, and votes so
 * the Recommended ranking has something to order.
 *
 * Everything it creates is unmistakably fake:
 *  - domains end in `.invalid`, which RFC 2606 reserves so it can never
 *    resolve. A Visit website button on one of these goes nowhere, on purpose.
 *  - accounts use `@example.invalid` addresses and cannot receive email.
 *  - every description says it is an example.
 *
 * `assertNotProduction` refuses to run against a production environment or a
 * hosted-looking database. These rows are for looking at the design on your
 * own machine; they are not recommendations and must never be served to
 * anyone as if they were.
 */

/** Example listings. Names are invented; none refers to a real website. */
const EXAMPLE_SOURCES = [
  {
    id: 'wsr_example_movies1',
    name: 'Framehouse',
    domain: 'framehouse.invalid',
    description: 'Example listing — independent films, documentaries and overlooked favourites.',
    categories: { movies: true },
    likes: 30,
    dislikes: 3,
  },
  {
    id: 'wsr_example_anime1',
    name: 'AniHarbor',
    domain: 'aniharbor.invalid',
    description: 'Example listing — a starting point for anime series and films.',
    categories: { anime: true },
    likes: 24,
    dislikes: 2,
  },
  {
    id: 'wsr_example_tv1',
    name: 'Sunday TV',
    domain: 'sundaytv.invalid',
    description: 'Example listing — series for your next quiet night in.',
    categories: { tv: true },
    likes: 20,
    dislikes: 2,
  },
  {
    id: 'wsr_example_manga1',
    name: 'Paper Lantern',
    domain: 'paperlantern.invalid',
    description: 'Example listing — a new chapter and a comfortable place to read.',
    categories: { manga: true },
    likes: 17,
    dislikes: 1,
  },
  {
    id: 'wsr_example_manhwa1',
    name: 'Seoul Shelf',
    domain: 'seoulshelf.invalid',
    description: 'Example listing — full-colour stories for one more chapter.',
    categories: { manhwa: true },
    likes: 15,
    dislikes: 2,
  },
  {
    id: 'wsr_example_comics1',
    name: 'Panel House',
    domain: 'panelhouse.invalid',
    description: 'Example listing — comic series and illustrated stories.',
    categories: { comics: true },
    likes: 12,
    dislikes: 2,
  },
  {
    id: 'wsr_example_multi1',
    name: 'Reel Room',
    domain: 'reelroom.invalid',
    description: 'Example listing — classics and international cinema, plus series.',
    categories: { movies: true, tv: true },
    likes: 9,
    dislikes: 1,
  },
  {
    // Carries the ad warning, so that state is visible locally too.
    id: 'wsr_example_ads1',
    name: 'Afterhours',
    domain: 'afterhours.invalid',
    description: 'Example listing — shows the "Lots of ads" warning.',
    categories: { tv: true },
    likes: 8,
    dislikes: 8,
    hasLotsOfAds: true,
  },
  {
    // Carries the stronger warning, so the difference between the two is
    // visible side by side rather than having to be imagined.
    id: 'wsr_example_avoid1',
    name: 'Popup Palace',
    domain: 'popuppalace.invalid',
    description: 'Example listing — shows the stronger "Avoid" warning.',
    categories: { movies: true },
    likes: 2,
    dislikes: 19,
    shouldAvoid: true,
    avoidReason: 'Asks for a card number before anything plays.',
  },
  {
    // No votes, so the unrated state is visible too.
    id: 'wsr_example_new1',
    name: 'Long Scroll',
    domain: 'longscroll.invalid',
    description: 'Example listing — newly added, with no feedback yet.',
    categories: { manhwa: true },
    likes: 0,
    dislikes: 0,
  },
];

const VOTER_COUNT = 40;

export async function seed(connectionString: string): Promise<void> {
  await runMigrations(connectionString);
  const db = createDatabase({ connectionString, ssl: false });

  // Guides first: they are the real content, and seeding is idempotent.
  let guidesAdded = 0;
  for (const guide of GUIDE_SEED) {
    const existing = await db
      .select({ id: guides.id })
      .from(guides)
      .where(sql`${guides.slug} = ${guide.slug}`)
      .limit(1);
    if (existing[0]) {
      await db.update(guides).set({ ...guide, updatedAt: new Date() }).where(sql`${guides.id} = ${existing[0].id}`);
    } else {
      await db.insert(guides).values(guide);
      guidesAdded += 1;
    }
  }

  // Voters. Unverified and unusable: there is no password hash, so none of
  // these can be signed into.
  for (let i = 1; i <= VOTER_COUNT; i += 1) {
    await db.execute(sql`
      insert into users (id, username, email, display_name, email_verified_at)
      values (${'usr_example' + i}, ${'example-voter-' + i},
              ${'example-voter-' + i + '@example.invalid'}, ${'Example Voter ' + i}, now())
      on conflict do nothing
    `);
  }

  for (const source of EXAMPLE_SOURCES) {
    await db.execute(sql`
      insert into watch_sources (
        id, name, domain, homepage_url, source_type, description, has_lots_of_ads,
        should_avoid, avoid_reason,
        supports_anime, supports_movies, supports_tv, supports_manga, supports_manhwa, supports_comics,
        is_enabled
      )
      values (
        ${source.id}, ${source.name}, ${source.domain}, ${'https://' + source.domain + '/'},
        'COMMUNITY', ${source.description}, ${source.hasLotsOfAds ?? false},
        ${source.shouldAvoid ?? false}, ${source.avoidReason ?? null},
        ${source.categories.anime ?? false}, ${source.categories.movies ?? false},
        ${source.categories.tv ?? false}, ${source.categories.manga ?? false},
        ${source.categories.manhwa ?? false}, ${source.categories.comics ?? false},
        true
      )
      on conflict (domain) do nothing
    `);

    for (let i = 1; i <= source.likes + source.dislikes; i += 1) {
      const value = i <= source.likes ? 'LIKE' : 'DISLIKE';
      await db.execute(sql`
        insert into source_votes (id, source_id, user_id, value)
        values (${'svt_' + source.id + '_' + i}, ${source.id}, ${'usr_example' + i}, ${value}::source_vote_value)
        on conflict do nothing
      `);
    }
  }

  process.stdout.write(
    '\nCouchlist development seed complete.\n' +
      `  ${GUIDE_SEED.length} guides (${guidesAdded} new), all marked "not yet reviewed".\n` +
      `  ${EXAMPLE_SOURCES.length} example sources on .invalid domains, with votes.\n` +
      '\nThe example sources are invented and their links go nowhere. They exist\n' +
      'so the design can be seen locally. Do not serve them to anyone as real\n' +
      'recommendations. Remove them with: npm run db:reset\n\n',
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

  await seed(url);
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
