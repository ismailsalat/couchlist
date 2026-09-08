import { mediaKey, type MediaIdentity } from '../media/identity.js';

/**
 * Taste match between two users.
 *
 * Deterministic and explainable on purpose: the score is how closely two people
 * rate the same titles, nothing more. No machine learning, no hidden weights.
 *
 *   agreement = 1 - (mean absolute rating difference / MAX_RATING_DISTANCE)
 *
 * Ratings run 1-10, so the largest possible gap is 9. Two people who rate
 * everything identically score 100%; someone who gives 1 to everything the
 * other gives 10 scores 0%.
 */

/** Below this many commonly-rated titles the number would be noise. */
export const MIN_SHARED_RATINGS = 3;

/** Ratings are 1-10, so the widest disagreement is 9 points. */
const MAX_RATING_DISTANCE = 9;

/** A title is "loved" at this rating or above. */
export const LOVED_THRESHOLD = 8;

/** Recommendations come from titles rated at least this highly. */
export const RECOMMEND_THRESHOLD = 8;

export interface RatedEntry extends MediaIdentity {
  title: string;
  rating: number | null;
  /** True when the user has finished it - used for recommendations. */
  completed: boolean;
}

export interface SharedTitle {
  identity: MediaIdentity;
  title: string;
  ratingA: number;
  ratingB: number;
  difference: number;
}

export interface Recommendation {
  identity: MediaIdentity;
  title: string;
  rating: number;
}

export type TasteMatch =
  | {
      status: 'ok';
      matchPercent: number;
      sharedTitles: number;
      sharedRatedTitles: number;
      bothLoved: SharedTitle[];
      biggestDisagreements: SharedTitle[];
      aRecommendsToB: Recommendation[];
      bRecommendsToA: Recommendation[];
    }
  | {
      status: 'not_enough_data';
      sharedTitles: number;
      sharedRatedTitles: number;
      needed: number;
    };

export function calculateTasteMatch(
  entriesA: RatedEntry[],
  entriesB: RatedEntry[],
  options: { minShared?: number } = {},
): TasteMatch {
  const minShared = options.minShared ?? MIN_SHARED_RATINGS;

  const byKeyA = indexByKey(entriesA);
  const byKeyB = indexByKey(entriesB);

  const shared: SharedTitle[] = [];
  let sharedTitles = 0;

  for (const [key, a] of byKeyA) {
    const b = byKeyB.get(key);
    if (!b) continue;
    sharedTitles += 1;

    if (a.rating === null || b.rating === null) continue;
    shared.push({
      identity: { provider: a.provider, providerMediaId: a.providerMediaId, mediaType: a.mediaType },
      title: a.title,
      ratingA: a.rating,
      ratingB: b.rating,
      difference: Math.abs(a.rating - b.rating),
    });
  }

  if (shared.length < minShared) {
    return {
      status: 'not_enough_data',
      sharedTitles,
      sharedRatedTitles: shared.length,
      needed: minShared - shared.length,
    };
  }

  const meanDifference =
    shared.reduce((total, item) => total + item.difference, 0) / shared.length;
  const matchPercent = clampPercent(
    Math.round((1 - meanDifference / MAX_RATING_DISTANCE) * 100),
  );

  const bothLoved = shared
    .filter((item) => item.ratingA >= LOVED_THRESHOLD && item.ratingB >= LOVED_THRESHOLD)
    .sort((left, right) => right.ratingA + right.ratingB - (left.ratingA + left.ratingB));

  // Ties broken by title so the same inputs always produce the same order.
  const biggestDisagreements = [...shared]
    .filter((item) => item.difference > 0)
    .sort((left, right) => right.difference - left.difference || left.title.localeCompare(right.title));

  return {
    status: 'ok',
    matchPercent,
    sharedTitles,
    sharedRatedTitles: shared.length,
    bothLoved,
    biggestDisagreements,
    aRecommendsToB: recommendations(entriesA, byKeyB),
    bRecommendsToA: recommendations(entriesB, byKeyA),
  };
}

/** Highly rated titles the other person has no entry for at all. */
function recommendations(
  from: RatedEntry[],
  otherByKey: Map<string, RatedEntry>,
): Recommendation[] {
  return from
    .filter((entry) => entry.rating !== null && entry.rating >= RECOMMEND_THRESHOLD)
    .filter((entry) => !otherByKey.has(mediaKey(entry)))
    .sort((left, right) => (right.rating ?? 0) - (left.rating ?? 0) || left.title.localeCompare(right.title))
    .map((entry) => ({
      identity: {
        provider: entry.provider,
        providerMediaId: entry.providerMediaId,
        mediaType: entry.mediaType,
      },
      title: entry.title,
      rating: entry.rating as number,
    }));
}

function indexByKey(entries: RatedEntry[]): Map<string, RatedEntry> {
  const map = new Map<string, RatedEntry>();
  for (const entry of entries) map.set(mediaKey(entry), entry);
  return map;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
