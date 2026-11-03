/**
 * What a tool answer looks like.
 *
 * Every verdict carries its *signals* rather than a single blended score. A
 * blended score would be an opinion we invented; a list of named signals is a
 * report of what each source actually said, which is the only thing we can
 * defend. The UI shows the level, then the signals underneath.
 *
 * `UNKNOWN` is deliberately not called "safe". Nobody having reported a
 * domain is not evidence that it is harmless, and a tool that implies
 * otherwise is worse than no tool.
 */

export const VERDICT_LEVELS = ['LISTED_OK', 'LISTED_WARN', 'REMOVED', 'DANGEROUS', 'UNKNOWN'] as const;
export type VerdictLevel = (typeof VERDICT_LEVELS)[number];

/** How a level should read. Ordered worst-first for `escalate` below. */
const SEVERITY: Record<VerdictLevel, number> = {
  DANGEROUS: 4,
  REMOVED: 3,
  LISTED_WARN: 2,
  UNKNOWN: 1,
  LISTED_OK: 0,
};

/**
 * The worse of two levels wins.
 *
 * A domain can be both listed on Couchlist and on a malware feed; the feed
 * must win, because the cost of being wrong is asymmetric. Our own directory
 * can be out of date, a malware listing rarely is.
 */
export function escalate(a: VerdictLevel, b: VerdictLevel): VerdictLevel {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

/** Where one piece of evidence came from, and what it said. */
export interface VerdictSignal {
  /** Display name, shown verbatim: "Google Safe Browsing", "Couchlist". */
  source: string;
  status: 'clean' | 'flagged' | 'unknown' | 'unavailable';
  /** One short human sentence. Never a raw API payload. */
  detail: string;
  /** When this evidence was gathered, if known. */
  checkedAt?: string;
}

export interface SiteVerdict {
  /** The normalised hostname the answer is about. */
  domain: string;
  level: VerdictLevel;
  /** Short headline, e.g. "Listed on Couchlist". */
  title: string;
  /** A paragraph a person can act on. */
  body: string;
  signals: VerdictSignal[];
  /** Set when the domain is in our directory. */
  source?: { id: string; name: string; slugPath: string };
  /** Populated when the domain looks like a different, known one. */
  lookalikeOf?: string;
  /** Other addresses this same listing answers on. */
  mirrors?: string[];
  /** Listings in the same categories, for when this one is down. */
  alternatives?: Array<{ id: string; name: string; domain: string }>;
}

/**
 * True when a level justifies showing a warning interstitial rather than a
 * plain result. Kept here so the page and the bookmarklet agree.
 */
export function warnsLoudly(level: VerdictLevel): boolean {
  return level === 'DANGEROUS' || level === 'REMOVED';
}
