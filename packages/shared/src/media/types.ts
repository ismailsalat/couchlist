import type { MediaIdentity, MediaType } from './identity.js';

/** The normalised shape both providers are mapped into. */
export interface MediaSummary extends MediaIdentity {
  /** Stable cross-provider key when the provider exposes one (Anime: mal:<id>). */
  canonicalMediaKey?: string | null;
  title: string;
  year: number | null;
  posterUrl: string | null;
  /** Episodes for anime/TV, null for movies or when unknown. */
  episodeCount: number | null;
  /** Runtime in minutes, for movies. */
  runtimeMinutes: number | null;
  /** Seasons, for TV. */
  seasonCount: number | null;
}

export interface MediaDetail extends MediaSummary {
  bannerUrl: string | null;
  description: string | null;
  genres: string[];
  status: string | null;
  studio: string | null;
  source: string | null;
}

export interface SearchResult {
  results: MediaSummary[];
  /** True when a provider failed but others succeeded, so the UI can say so. */
  degraded: boolean;
  failedProviders: string[];
}

export const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  ANIME: 'Anime',
  MOVIE: 'Movie',
  TV: 'TV Show',
};
