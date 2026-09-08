import { MediaType } from './identity.js';
import type { MediaSummary } from './types.js';

/**
 * De-duplicate mixed Anime + TMDB search results without collapsing remakes.
 *
 * Anime providers already fail over one-at-a-time, but TMDB also indexes many
 * animated TV shows and films. If an Anime result and a TMDB result have the
 * same normalized title and release year, Couchlist keeps the Anime row. A
 * remake/adaptation with a different year remains visible.
 */
export function dedupeCrossCatalogSearch(results: MediaSummary[]): MediaSummary[] {
  const animeSignatures = new Set(
    results
      .filter((item) => item.mediaType === MediaType.ANIME && item.year !== null)
      .map((item) => `${normalizeMediaTitle(item.title)}:${item.year}`),
  );
  const seenAnimeCanonical = new Set<string>();

  return results.filter((item) => {
    if (item.mediaType === MediaType.ANIME) {
      if (item.canonicalMediaKey) {
        if (seenAnimeCanonical.has(item.canonicalMediaKey)) return false;
        seenAnimeCanonical.add(item.canonicalMediaKey);
      }
      return true;
    }

    if (item.year === null) return true;
    return !animeSignatures.has(`${normalizeMediaTitle(item.title)}:${item.year}`);
  });
}

export function normalizeMediaTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
