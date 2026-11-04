import 'server-only';

/**
 * One reputation provider.
 *
 * Every provider returns its own answer and is reported under its own name.
 * Nothing here blends two providers into a score: reporting that Safe
 * Browsing flagged a domain is a fact we can stand behind, while "trust
 * score 38/100" is a number we invented.
 */
export interface ProviderAnswer {
  status: 'clean' | 'flagged' | 'unknown' | 'unavailable';
  detail: string;
  /** How long this answer may be reused. Providers that say, decide. */
  cacheFor: number;
}

/**
 * What to ask about.
 *
 * `host` is the hostname; `path` is the rest of the address when somebody
 * pasted a full link. The distinction matters: Safe Browsing flags *URLs*,
 * often a single page on an otherwise ordinary domain, so asking only about
 * the root silently misses the thing the person is standing in front of.
 * Google's own test URLs are path-specific for exactly this reason.
 */
export interface LookupTarget {
  host: string;
  /** Includes the leading slash, or null when only a bare domain was given. */
  path: string | null;
}

export interface ReputationProvider {
  /** Shown verbatim in the result. */
  name: string;
  /** False when no key is configured, so the chain can skip it silently. */
  configured(): boolean;
  /** Only ever asks *about* an address. Nothing here retrieves one. */
  lookup(target: LookupTarget, signal: AbortSignal): Promise<ProviderAnswer>;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
