import {
  AVAILABILITY_TEXT,
  isAuthorizedSourceType,
  QualityLabel,
  WatchAccessType,
  WatchAvailabilityStatus,
  WatchSourceType,
  weightedWatchRating,
  type AudioLabel,
} from './types.js';

/**
 * A single row in the Watch section, already flattened for rendering. The web
 * layer should never have to join source metadata to availability by hand.
 */
export interface WatchOption {
  id: string;
  sourceId: string;
  name: string;
  domain: string;
  sourceType: WatchSourceType;
  accessType: WatchAccessType;
  quality: QualityLabel;
  audio: AudioLabel;
  priceLabel: string | null;
  regionInfo: string | null;
  availabilityUrl: string;
  availabilityStatus: WatchAvailabilityStatus;
  lastCheckedAt: Date | null;
  requiresAccount: boolean;
  isVerified: boolean;
  allowsEmbed: boolean;
  supportsAnime?: boolean;
  supportsMovies?: boolean;
  supportsTv?: boolean;
  ratingAverage?: number | null;
  ratingCount?: number;
  reliabilityPercent?: number | null;
  workingRecent?: number;
  brokenRecent?: number;
  healthStatus?: 'HEALTHY' | 'WATCH' | 'DEGRADED' | 'POSSIBLY_UNAVAILABLE';
  /** Registry-only source: supports this media type, but this exact title is not confirmed there. */
  directoryOnly?: boolean;
  /** Optional provider names/access tiers behind an aggregate chooser such as JustWatch. */
  providerOptions?: Array<{ name: string; accessTypes: WatchAccessType[] }>;
}

export const WatchFilter = {
  ALL: 'ALL',
  FREE: 'FREE',
  SUBSCRIPTION: 'SUBSCRIPTION',
  RENT_BUY: 'RENT_BUY',
  OFFICIAL: 'OFFICIAL',
  COMMUNITY: 'COMMUNITY',
} as const;
export type WatchFilter = (typeof WatchFilter)[keyof typeof WatchFilter];

export const AudioFilter = {
  ANY: 'ANY',
  SUB: 'SUB',
  DUB: 'DUB',
} as const;
export type AudioFilter = (typeof AudioFilter)[keyof typeof AudioFilter];

/** Ranking within a tier. Cheaper and more certain options come first. */
const ACCESS_RANK: Record<WatchAccessType, number> = {
  FREE: 0,
  FREE_WITH_ADS: 1,
  SUBSCRIPTION: 2,
  LIBRARY_CARD: 3,
  RENT: 4,
  BUY: 5,
  UNKNOWN: 6,
};

const AVAILABILITY_RANK: Record<WatchAvailabilityStatus, number> = {
  AVAILABLE: 0,
  UNKNOWN: 1,
  RECENTLY_UNAVAILABLE: 2,
};

const HEALTH_PENALTY: Record<NonNullable<WatchOption['healthStatus']>, number> = {
  HEALTHY: 0,
  WATCH: 0.3,
  DEGRADED: 0.75,
  POSSIBLY_UNAVAILABLE: 1.5,
};

/** Community feedback can lower standing without silently hiding a source. */
function watchOptionStanding(option: WatchOption): number {
  const weighted = weightedWatchRating(option.ratingAverage ?? null, option.ratingCount ?? 0);
  return weighted - HEALTH_PENALTY[option.healthStatus ?? 'HEALTHY'];
}

export function matchesFilter(option: WatchOption, filter: WatchFilter): boolean {
  const accessTypes = new Set<WatchAccessType>([
    option.accessType,
    ...(option.providerOptions ?? []).flatMap((provider) => provider.accessTypes),
  ]);

  switch (filter) {
    case WatchFilter.ALL:
      return true;
    case WatchFilter.FREE:
      return (
        accessTypes.has(WatchAccessType.FREE) ||
        accessTypes.has(WatchAccessType.FREE_WITH_ADS)
      );
    case WatchFilter.SUBSCRIPTION:
      return accessTypes.has(WatchAccessType.SUBSCRIPTION);
    case WatchFilter.RENT_BUY:
      return accessTypes.has(WatchAccessType.RENT) || accessTypes.has(WatchAccessType.BUY);
    case WatchFilter.OFFICIAL:
      return isAuthorizedSourceType(option.sourceType);
    case WatchFilter.COMMUNITY:
      return !isAuthorizedSourceType(option.sourceType);
    default:
      return true;
  }
}

export function matchesAudioFilter(option: WatchOption, filter: AudioFilter): boolean {
  if (filter === AudioFilter.ANY) return true;
  if (option.audio === 'SUB_DUB') return true;
  return option.audio === filter;
}

/**
 * Default order: authorized sources first, then availability, then cost, then
 * name. A user's preferred service floats to the top of its own tier — it
 * changes ordering only, never which options are shown.
 */
export function sortWatchOptions(
  options: readonly WatchOption[],
  preferredSourceId?: string | null,
): WatchOption[] {
  return [...options].sort((a, b) => {
    const preferredDiff =
      Number(b.sourceId === preferredSourceId) - Number(a.sourceId === preferredSourceId);
    if (preferredDiff !== 0) return preferredDiff;

    const tierDiff =
      Number(isAuthorizedSourceType(b.sourceType)) - Number(isAuthorizedSourceType(a.sourceType));
    if (tierDiff !== 0) return tierDiff;

    const availabilityDiff =
      AVAILABILITY_RANK[a.availabilityStatus] - AVAILABILITY_RANK[b.availabilityStatus];
    if (availabilityDiff !== 0) return availabilityDiff;

    const standingDiff = watchOptionStanding(b) - watchOptionStanding(a);
    if (standingDiff !== 0) return standingDiff;

    const ratingCountDiff = (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
    if (ratingCountDiff !== 0) return ratingCountDiff;

    const accessDiff = ACCESS_RANK[a.accessType] - ACCESS_RANK[b.accessType];
    if (accessDiff !== 0) return accessDiff;

    return a.name.localeCompare(b.name);
  });
}

export interface GroupedWatchOptions {
  authorized: WatchOption[];
  community: WatchOption[];
}

export function groupWatchOptions(options: readonly WatchOption[]): GroupedWatchOptions {
  const authorized: WatchOption[] = [];
  const community: WatchOption[] = [];
  for (const option of options) {
    (isAuthorizedSourceType(option.sourceType) ? authorized : community).push(option);
  }
  return { authorized, community };
}

/** "Last checked 3h ago", or an honest blank when nothing has checked it. */
export function lastCheckedText(at: Date | null, now: Date = new Date()): string | null {
  if (!at) return null;

  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 0) return 'Last checked just now';
  if (minutes < 2) return 'Last checked just now';
  if (minutes < 60) return `Last checked ${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last checked ${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `Last checked ${days}d ago`;
  return 'Last checked over a month ago';
}

export function availabilityText(status: WatchAvailabilityStatus): string {
  return AVAILABILITY_TEXT[status];
}
