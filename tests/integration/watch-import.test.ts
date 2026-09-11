import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@couchlist/db';
import {
  applyAvailabilityImport,
  applySourceImport,
  previewAvailabilityImport,
  previewSourceImport,
} from '@couchlist/db';
import { parseAvailabilityImport, parseSourceImport } from '@couchlist/shared';
import { repositories, resetTables, setupTestDatabase } from '../helpers/db';

let db: Database;
let repos: ReturnType<typeof repositories>;

beforeAll(async () => {
  db = await setupTestDatabase();
  repos = repositories(db);
});

beforeEach(async () => {
  await resetTables(db);
});

const JSON_INPUT = JSON.stringify([
  {
    name: 'Example',
    domain: 'example.com',
    homepageUrl: 'https://example.com',
    sourceType: 'COMMUNITY',
    sourceOrigin: 'MANUAL',
    supportsAnime: true,
    supportsMovies: true,
    supportsTv: true,
    isEnabled: true,
  },
  { name: 'Second', homepageUrl: 'https://second.example', sourceType: 'OFFICIAL' },
]);

const CSV_INPUT = [
  'name,homepageUrl,sourceType,supportsMovies',
  'Example,https://example.com,COMMUNITY,true',
  'Second,https://second.example,OFFICIAL,false',
].join('\n');

describe('import parsing', () => {
  it('reads JSON', () => {
    const result = parseSourceImport(JSON_INPUT);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.domain).toBe('example.com');
    expect(result.rows[0]?.supportsAnime).toBe(true);
  });

  it('reads CSV', () => {
    const result = parseSourceImport(CSV_INPUT);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.domain)).toEqual(['example.com', 'second.example']);
    expect(result.rows[0]?.supportsMovies).toBe(true);
    expect(result.rows[1]?.supportsMovies).toBe(false);
  });

  it('normalises domain spellings to one identity', () => {
    const result = parseSourceImport(
      JSON.stringify([
        { homepageUrl: 'https://www.Example.com/' },
        { homepageUrl: 'http://example.com' },
        { domain: 'www.example.com' },
      ]),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.domain).toBe('example.com');
    expect(result.duplicates).toBe(2);
  });

  it('rejects unsafe protocols', () => {
    const result = parseSourceImport(
      JSON.stringify([
        { homepageUrl: 'javascript:alert(1)' },
        { homepageUrl: 'data:text/html,x' },
        { homepageUrl: 'file:///etc/passwd' },
        { homepageUrl: 'ftp://example.com' },
      ]),
    );
    expect(result.rows).toHaveLength(0);
    expect(result.invalid).toHaveLength(4);
  });

  it('rejects private and link-local targets', () => {
    const result = parseSourceImport(
      JSON.stringify([
        { homepageUrl: 'http://localhost:3000' },
        { homepageUrl: 'http://127.0.0.1/admin' },
        { homepageUrl: 'http://10.0.0.5' },
        { homepageUrl: 'http://169.254.169.254/latest/meta-data/' },
      ]),
    );
    expect(result.rows).toHaveLength(0);
    expect(result.invalid).toHaveLength(4);
  });

  it('rejects a row whose stated domain disagrees with its URL', () => {
    const result = parseSourceImport(
      JSON.stringify([{ domain: 'example.com', homepageUrl: 'https://other.example' }]),
    );
    expect(result.rows).toHaveLength(0);
    expect(result.invalid[0]?.reason).toContain('does not match');
  });

  it('keeps omitted update fields omitted during parsing', () => {
    const result = parseSourceImport(JSON.stringify([{ homepageUrl: 'https://example.com' }]));
    expect(result.rows[0]?.sourceType).toBeUndefined();
    expect(result.rows[0]?.name).toBeUndefined();
  });

  it('reports malformed JSON instead of throwing', () => {
    const result = parseSourceImport('[{ broken');
    expect(result.rows).toHaveLength(0);
    expect(result.invalid[0]?.reason).toContain('invalid JSON');
  });
});

describe('preview', () => {
  it('counts what would happen without writing anything', async () => {
    const preview = await previewSourceImport(repos.watchSources, JSON_INPUT);

    expect(preview.rows).toBe(2);
    expect(preview.create).toBe(2);
    expect(preview.update).toBe(0);

    // Nothing may exist yet.
    expect(await repos.watchSources.findSourceByDomain('example.com')).toBeUndefined();
    expect(await repos.watchSources.listSources()).toHaveLength(0);
  });

  it('classifies an existing domain as an update', async () => {
    await applySourceImport(repos.watchSources, JSON_INPUT);
    const preview = await previewSourceImport(repos.watchSources, JSON_INPUT);
    expect(preview.create).toBe(0);
    expect(preview.update).toBe(2);
  });
});

describe('apply', () => {
  it('writes sources to the database', async () => {
    const outcome = await applySourceImport(repos.watchSources, JSON_INPUT);
    expect(outcome.created).toBe(2);

    const stored = await repos.watchSources.findSourceByDomain('example.com');
    expect(stored?.name).toBe('Example');
    expect(stored?.sourceType).toBe('COMMUNITY');
    expect(stored?.isEnabled).toBe(true);
  });

  it('never marks an imported source verified', async () => {
    await applySourceImport(
      repos.watchSources,
      JSON.stringify([
        { homepageUrl: 'https://example.com', isVerified: true, sourceType: 'OFFICIAL' },
      ]),
    );
    const stored = await repos.watchSources.findSourceByDomain('example.com');
    expect(stored?.isVerified).toBe(false);
  });

  it('leaves a source disabled unless the import says otherwise', async () => {
    await applySourceImport(
      repos.watchSources,
      JSON.stringify([{ homepageUrl: 'https://quiet.example' }]),
    );
    const stored = await repos.watchSources.findSourceByDomain('quiet.example');
    expect(stored?.isEnabled).toBe(false);
  });

  it('is idempotent: the same import twice creates no duplicates', async () => {
    await applySourceImport(repos.watchSources, JSON_INPUT);
    const second = await applySourceImport(repos.watchSources, JSON_INPUT);

    expect(second.updated).toBe(2);
    expect(second.created).toBe(0);
    expect(await repos.watchSources.listSources()).toHaveLength(2);
  });

  it('treats URL spelling variants as the same row on re-import', async () => {
    await applySourceImport(
      repos.watchSources,
      JSON.stringify([{ homepageUrl: 'https://example.com' }]),
    );
    await applySourceImport(
      repos.watchSources,
      JSON.stringify([{ homepageUrl: 'https://www.Example.com/' }]),
    );
    expect(await repos.watchSources.listSources()).toHaveLength(1);
  });

  it('does not erase existing values when a later import omits them', async () => {
    await applySourceImport(
      repos.watchSources,
      JSON.stringify([
        {
          name: 'Example',
          homepageUrl: 'https://example.com',
          sourceType: 'COMMUNITY',
          supportsAnime: true,
          regionInfo: 'US',
          isEnabled: true,
        },
      ]),
    );

    // A minimal row for the same domain: everything omitted must survive.
    await applySourceImport(
      repos.watchSources,
      JSON.stringify([{ name: 'Example Renamed', homepageUrl: 'https://example.com' }]),
    );

    const stored = await repos.watchSources.findSourceByDomain('example.com');
    expect(stored?.name).toBe('Example Renamed');
    expect(stored?.sourceType).toBe('COMMUNITY');
    expect(stored?.origin).toBe('MANUAL');
    expect(stored?.supportsAnime).toBe(true);
    expect(stored?.regionInfo).toBe('US');
    expect(stored?.isEnabled).toBe(true);
  });

  it('applies safe defaults only when inserting a new source', async () => {
    await applySourceImport(
      repos.watchSources,
      JSON.stringify([{ domain: 'defaults.example' }]),
    );
    const stored = await repos.watchSources.findSourceByDomain('defaults.example');
    expect(stored).toMatchObject({
      name: 'defaults.example',
      homepageUrl: 'https://defaults.example/',
      sourceType: 'UNVERIFIED',
      origin: 'MANUAL',
      accessType: 'UNKNOWN',
      isEnabled: false,
    });
  });

  it('stores accessType on a brand-new source import', async () => {
    await applySourceImport(
      repos.watchSources,
      JSON.stringify([{ domain: 'free.example', accessType: 'FREE_WITH_ADS' }]),
    );
    const stored = await repos.watchSources.findSourceByDomain('free.example');
    expect(stored?.accessType).toBe('FREE_WITH_ADS');
  });

  it('imports the same set from CSV as from JSON', async () => {
    await applySourceImport(repos.watchSources, CSV_INPUT);
    const domains = (await repos.watchSources.listSources()).map((row) => row.domain);
    expect(domains).toEqual(['example.com', 'second.example']);
  });

  it('skips invalid rows but still imports the good ones', async () => {
    const outcome = await applySourceImport(
      repos.watchSources,
      JSON.stringify([
        { homepageUrl: 'https://good.example' },
        { homepageUrl: 'javascript:alert(1)' },
        { homepageUrl: 'http://127.0.0.1' },
      ]),
    );

    expect(outcome.created).toBe(1);
    expect(outcome.invalid).toHaveLength(2);
    expect(await repos.watchSources.listSources()).toHaveLength(1);
  });
});

describe('title availability import', () => {
  beforeEach(async () => {
    await applySourceImport(
      repos.watchSources,
      JSON.stringify([
        { domain: 'anime.example', isEnabled: true },
        { domain: 'movie.example', isEnabled: true },
      ]),
    );
  });

  it('parses canonical anime and TMDB content keys', () => {
    const parsed = parseAvailabilityImport(
      JSON.stringify([
        {
          contentKey: 'CANONICAL:mal:21',
          domain: 'anime.example',
          availabilityUrl: 'https://anime.example/one-piece',
        },
        {
          contentKey: 'TMDB:MOVIE:157336',
          domain: 'movie.example',
          availabilityUrl: 'https://movie.example/title/157336',
        },
      ]),
    );
    expect(parsed.invalid).toHaveLength(0);
    expect(parsed.rows.map((row) => row.mediaType)).toEqual(['ANIME', 'MOVIE']);
  });

  it('rejects unresolved provider anime identities', () => {
    const parsed = parseAvailabilityImport(
      JSON.stringify([
        {
          contentKey: 'ANILIST:ANIME:21',
          domain: 'anime.example',
          availabilityUrl: 'https://anime.example/one-piece',
        },
      ]),
    );
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.invalid[0]?.reason).toContain('CANONICAL:mal');
  });

  it('previews without writing and rejects unknown domains', async () => {
    const input = JSON.stringify([
      {
        contentKey: 'CANONICAL:mal:21',
        domain: 'anime.example',
        availabilityUrl: 'https://anime.example/one-piece',
      },
      {
        contentKey: 'TMDB:TV:1396',
        domain: 'missing.example',
        availabilityUrl: 'https://missing.example/show/1396',
      },
    ]);
    const preview = await previewAvailabilityImport(repos.watchSources, input);
    expect(preview.create).toBe(1);
    expect(preview.invalid).toHaveLength(1);
    expect(await repos.watchSources.listingsForContent('CANONICAL:mal:21')).toHaveLength(0);
  });

  it('creates one canonical anime availability row and stays idempotent', async () => {
    const input = JSON.stringify([
      {
        contentKey: 'CANONICAL:mal:21',
        domain: 'anime.example',
        availabilityUrl: 'https://anime.example/one-piece',
        accessType: 'FREE',
        quality: 'HD_CLAIMED',
        audio: 'SUB_DUB',
        availabilityStatus: 'AVAILABLE',
      },
    ]);

    const first = await applyAvailabilityImport(repos.watchSources, input);
    const second = await applyAvailabilityImport(repos.watchSources, input);
    expect(first.created).toBe(1);
    expect(second.updated).toBe(1);

    const listings = await repos.watchSources.listingsForContent('CANONICAL:mal:21');
    expect(listings).toHaveLength(1);
    expect(listings[0]?.listing).toMatchObject({
      canonicalMediaKey: 'mal:21',
      provider: null,
      accessType: 'FREE',
      quality: 'HD_CLAIMED',
      audio: 'SUB_DUB',
    });
  });

  it('preserves omitted title metadata on a later update', async () => {
    await applyAvailabilityImport(
      repos.watchSources,
      JSON.stringify([
        {
          contentKey: 'TMDB:MOVIE:157336',
          domain: 'movie.example',
          availabilityUrl: 'https://movie.example/title/157336',
          accessType: 'RENT',
          quality: '1080p',
          availabilityStatus: 'AVAILABLE',
        },
      ]),
    );

    await applyAvailabilityImport(
      repos.watchSources,
      JSON.stringify([
        {
          contentKey: 'TMDB:MOVIE:157336',
          domain: 'movie.example',
          availabilityUrl: 'https://movie.example/new-url',
        },
      ]),
    );

    const listings = await repos.watchSources.listingsForContent('TMDB:MOVIE:157336');
    expect(listings[0]?.listing).toMatchObject({
      accessType: 'RENT',
      quality: '1080p',
      availabilityStatus: 'AVAILABLE',
      provider: null,
    });
  });
});

describe('registry listing', () => {
  beforeEach(async () => {
    await applySourceImport(
      repos.watchSources,
      JSON.stringify([
        { name: 'Off', homepageUrl: 'https://off.example', sourceType: 'OFFICIAL', isEnabled: true },
        { name: 'Com', homepageUrl: 'https://com.example', sourceType: 'COMMUNITY' },
      ]),
    );
  });

  it('filters by source type', async () => {
    const official = await repos.watchSources.listSources({ sourceType: 'OFFICIAL' });
    expect(official.map((row) => row.domain)).toEqual(['off.example']);
  });

  it('filters by enabled state', async () => {
    const enabled = await repos.watchSources.listSources({ isEnabled: true });
    expect(enabled.map((row) => row.domain)).toEqual(['off.example']);
  });

  it('searches by name and domain', async () => {
    expect(await repos.watchSources.listSources({ search: 'com.ex' })).toHaveLength(1);
    expect(await repos.watchSources.listSources({ search: 'nothing' })).toHaveLength(0);
  });
});
