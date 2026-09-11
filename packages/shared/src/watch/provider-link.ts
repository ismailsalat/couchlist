import type { AudioLabel, QualityLabel, WatchAccessType, WatchSourceType } from './types.js';

/**
 * What a provider tells us about where a title can be watched.
 *
 * Providers disagree about detail: TMDB gives a rental tier but no resolution,
 * AniList gives a platform name and a link. Anything a provider does not
 * actually state stays undefined here and becomes UNKNOWN downstream, rather
 * than being invented.
 */
export interface ProviderWatchLink {
  /** Display name of the service, e.g. the platform a link points at. */
  sourceName: string;
  /** Destination for the user. Validated before it is stored. */
  url: string;
  sourceType: WatchSourceType;
  accessType: WatchAccessType;
  quality?: QualityLabel;
  audio?: AudioLabel;
  priceLabel?: string | null;
  regionInfo?: string | null;
  supportsAnime: boolean;
  supportsMovies: boolean;
  supportsTv: boolean;
  /** Provider-specific display metadata that does not belong in source identity. */
  metadata?: Record<string, unknown> | null;
}
