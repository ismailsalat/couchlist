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

export interface ReputationProvider {
  /** Shown verbatim in the result. */
  name: string;
  /** False when no key is configured, so the chain can skip it silently. */
  configured(): boolean;
  /** Never receives a URL it has to fetch — only a hostname to ask about. */
  lookup(domain: string, signal: AbortSignal): Promise<ProviderAnswer>;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
