import { describe, expect, it } from 'vitest';
import { parseSourceImport } from '@couchlist/shared';

/**
 * Import rules.
 *
 * The file an operator writes is the contract, so these tests are the
 * documentation of what that file may contain and what it does to a listing.
 */
describe('importing against the current directory', () => {
  it('reads a named category list and states all six', () => {
    const result = parseSourceImport(
      JSON.stringify([{ domain: 'example.test', categories: ['Movies', 'TV'] }]),
    );

    expect(result.invalid).toHaveLength(0);
    const row = result.rows[0]!;
    expect(row.supportsMovies).toBe(true);
    expect(row.supportsTv).toBe(true);
    // Naming any category means the row states all six, so an import can take
    // one away as well as add one.
    expect(row.supportsAnime).toBe(false);
    expect(row.supportsManga).toBe(false);
    expect(row.supportsManhwa).toBe(false);
    expect(row.supportsComics).toBe(false);
  });

  it('accepts the separators a hand-made file actually uses', () => {
    for (const written of ['Manga, Manhwa', 'Manga|Manhwa', 'Manga; Manhwa']) {
      const result = parseSourceImport(
        JSON.stringify([{ domain: 'example.test', categories: written }]),
      );
      expect(result.invalid, written).toHaveLength(0);
      expect(result.rows[0]!.supportsManga, written).toBe(true);
      expect(result.rows[0]!.supportsManhwa, written).toBe(true);
    }
  });

  it('accepts the words people write instead of the official ones', () => {
    const result = parseSourceImport(
      JSON.stringify([{ domain: 'example.test', categories: ['films', 'shows', 'webtoons'] }]),
    );

    expect(result.invalid).toHaveLength(0);
    expect(result.rows[0]!.supportsMovies).toBe(true);
    expect(result.rows[0]!.supportsTv).toBe(true);
    expect(result.rows[0]!.supportsManhwa).toBe(true);
  });

  it('rejects a category nobody has, and says which words are allowed', () => {
    const result = parseSourceImport(
      JSON.stringify([{ domain: 'example.test', categories: ['Movies', 'Podcasts'] }]),
    );

    expect(result.rows).toHaveLength(0);
    expect(result.invalid[0]!.reason).toContain('Podcasts');
    expect(result.invalid[0]!.reason).toContain('Manhwa');
  });

  it('carries a description, an ads warning and a quality label', () => {
    const result = parseSourceImport(
      JSON.stringify([
        {
          domain: 'example.test',
          description: 'What it is.',
          hasLotsOfAds: 'yes',
          qualityLabel: '4K',
        },
      ]),
    );

    expect(result.invalid).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({
      description: 'What it is.',
      hasLotsOfAds: true,
      qualityLabel: '4K',
    });
  });

  it('refuses to mark a site as one to avoid without saying why', () => {
    const result = parseSourceImport(
      JSON.stringify([{ domain: 'example.test', shouldAvoid: true }]),
    );

    expect(result.rows).toHaveLength(0);
    expect(result.invalid[0]!.reason).toContain('avoidReason');
  });

  it('keeps the warning when a reason comes with it', () => {
    const result = parseSourceImport(
      JSON.stringify([
        { domain: 'example.test', shouldAvoid: true, avoidReason: 'Serves malware.' },
      ]),
    );

    expect(result.invalid).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({ shouldAvoid: true, avoidReason: 'Serves malware.' });
  });

  it('rejects a description or label that is too long, with the numbers', () => {
    const long = parseSourceImport(
      JSON.stringify([{ domain: 'example.test', description: 'x'.repeat(400) }]),
    );
    expect(long.invalid[0]!.reason).toContain('400 characters');

    const label = parseSourceImport(
      JSON.stringify([{ domain: 'example.test', qualityLabel: 'far too long to fit' }]),
    );
    expect(label.invalid[0]!.reason).toContain('limit is 12');
  });

  it('still reads an older file written with the individual flags', () => {
    const result = parseSourceImport(
      JSON.stringify([{ domain: 'example.test', supportsAnime: 'true' }]),
    );

    expect(result.invalid).toHaveLength(0);
    expect(result.rows[0]!.supportsAnime).toBe(true);
    // Nothing else was stated, so nothing else is changed on an existing row.
    expect(result.rows[0]!.supportsManga).toBeUndefined();
  });

  it('reads categories from a CSV column too', () => {
    const result = parseSourceImport('domain,categories\nexample.test,"Anime|Manga"\n');

    expect(result.invalid).toHaveLength(0);
    expect(result.rows[0]!.supportsAnime).toBe(true);
    expect(result.rows[0]!.supportsManga).toBe(true);
  });
});
