/**
 * Confidence-aware ranking for the source directory.
 *
 * The rule this exists to enforce: a source with one positive vote must not
 * outrank a well-established source just because its percentage is higher.
 *
 * It reuses the Bayesian shrinkage already used for watch-source ratings
 * (`weightedWatchRating`) rather than introducing a second, differently-behaved
 * notion of "good". A rating out of five and a like ratio out of one are the
 * same calculation with different priors, so both now call `bayesianAverage`.
 */

/**
 * Pulls a small sample toward `prior` and leaves a large one nearly untouched.
 *
 * `priorWeight` is "how many imaginary average votes" every source starts with.
 */
export function bayesianAverage(
  average: number | null,
  count: number,
  prior: number,
  priorWeight: number,
): number {
  if (average === null || !Number.isFinite(average) || count <= 0) return prior;
  return (average * count + prior * priorWeight) / (count + priorWeight);
}

/** Votes start from "nobody knows yet", which is the middle. */
export const LIKE_RATIO_PRIOR = 0.5;
/**
 * Eight imaginary neutral votes. Chosen so that a brand-new source needs real
 * support before it reaches the front page, while a source with a hundred
 * votes is ranked by its actual ratio:
 *
 *   2 likes,  0 dislikes -> 0.60
 *  80 likes, 20 dislikes -> 0.78
 */
export const LIKE_RATIO_PRIOR_WEIGHT = 8;

export interface SourceVoteTotals {
  likes: number;
  dislikes: number;
}

/** The share of positive votes, or null when nobody has voted. */
export function likeRatio({ likes, dislikes }: SourceVoteTotals): number | null {
  const total = likes + dislikes;
  if (total <= 0) return null;
  return likes / total;
}

/** The shrunk like ratio, in 0..1. This is the directory's quality signal. */
export function confidenceWeightedLikeRatio(totals: SourceVoteTotals): number {
  const total = totals.likes + totals.dislikes;
  return bayesianAverage(likeRatio(totals), total, LIKE_RATIO_PRIOR, LIKE_RATIO_PRIOR_WEIGHT);
}

export interface RankableSource extends SourceVoteTotals {
  name: string;
  /** Operator control, 0-100. Lowers standing without deleting anything. */
  adminRankPenalty?: number;
  createdAt?: Date | string | null;
}

/**
 * The Recommended score.
 *
 * Only two things move it: community feedback, and an explicit operator
 * penalty. There is no hidden editorial weighting and no fabricated metric.
 */
export function recommendedScore(source: RankableSource): number {
  const penalty = Math.min(Math.max(source.adminRankPenalty ?? 0, 0), 100) / 100;
  return confidenceWeightedLikeRatio(source) - penalty;
}

export const SourceSort = {
  RECOMMENDED: 'recommended',
  NEWEST: 'newest',
  NAME: 'name',
} as const;
export type SourceSort = (typeof SourceSort)[keyof typeof SourceSort];

export function parseSourceSort(value: string | null | undefined): SourceSort {
  switch (value) {
    case SourceSort.NEWEST:
      return SourceSort.NEWEST;
    case SourceSort.NAME:
      return SourceSort.NAME;
    default:
      return SourceSort.RECOMMENDED;
  }
}

function timeValue(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

/**
 * Orders sources for display.
 *
 * Every comparison ends in a name tie-break so the order is stable: the left
 * column is a list position, and a position that changes between two identical
 * requests would be a bug, not a ranking.
 */
export function compareSources(sort: SourceSort) {
  return (a: RankableSource, b: RankableSource): number => {
    if (sort === SourceSort.NAME) {
      return a.name.localeCompare(b.name);
    }
    if (sort === SourceSort.NEWEST) {
      const difference = timeValue(b.createdAt) - timeValue(a.createdAt);
      if (difference !== 0) return difference;
      return a.name.localeCompare(b.name);
    }

    const scoreDifference = recommendedScore(b) - recommendedScore(a);
    if (Math.abs(scoreDifference) > 1e-9) return scoreDifference;

    // Equal scores: the more-voted source is the better-established one.
    const voteDifference = b.likes + b.dislikes - (a.likes + a.dislikes);
    if (voteDifference !== 0) return voteDifference;
    return a.name.localeCompare(b.name);
  };
}
