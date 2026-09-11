import { z } from 'zod';

/**
 * Watch source vocabulary.
 *
 * Couchlist stores information *about* where a title can be watched. It never
 * hosts, proxies or embeds third-party video, so everything here describes a
 * destination rather than a stream.
 */

export const WatchSourceType = {
  OFFICIAL: 'OFFICIAL',
  FREE_AD_SUPPORTED: 'FREE_AD_SUPPORTED',
  RENT_BUY: 'RENT_BUY',
  LIBRARY: 'LIBRARY',
  PUBLIC_DOMAIN: 'PUBLIC_DOMAIN',
  COMMUNITY: 'COMMUNITY',
  UNVERIFIED: 'UNVERIFIED',
} as const;
export type WatchSourceType = (typeof WatchSourceType)[keyof typeof WatchSourceType];

export const WatchAccessType = {
  SUBSCRIPTION: 'SUBSCRIPTION',
  FREE: 'FREE',
  FREE_WITH_ADS: 'FREE_WITH_ADS',
  RENT: 'RENT',
  BUY: 'BUY',
  LIBRARY_CARD: 'LIBRARY_CARD',
  UNKNOWN: 'UNKNOWN',
} as const;
export type WatchAccessType = (typeof WatchAccessType)[keyof typeof WatchAccessType];

export const WatchAvailabilityStatus = {
  AVAILABLE: 'AVAILABLE',
  UNKNOWN: 'UNKNOWN',
  RECENTLY_UNAVAILABLE: 'RECENTLY_UNAVAILABLE',
} as const;
export type WatchAvailabilityStatus =
  (typeof WatchAvailabilityStatus)[keyof typeof WatchAvailabilityStatus];

/**
 * Provenance of a source record. Community submissions are held to a different
 * standard than a provider API, so the origin has to survive into the database.
 */
export const WatchSourceOrigin = {
  OFFICIAL_API: 'OFFICIAL_API',
  MANUAL: 'MANUAL',
  COMMUNITY: 'COMMUNITY',
  DIRECTORY: 'DIRECTORY',
  OTHER: 'OTHER',
} as const;
export type WatchSourceOrigin = (typeof WatchSourceOrigin)[keyof typeof WatchSourceOrigin];

export const WatchCandidateStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type WatchCandidateStatus =
  (typeof WatchCandidateStatus)[keyof typeof WatchCandidateStatus];

export const WatchReportReason = {
  BROKEN_LINK: 'BROKEN_LINK',
  WRONG_TITLE: 'WRONG_TITLE',
  WRONG_EPISODE: 'WRONG_EPISODE',
  MISLEADING_QUALITY: 'MISLEADING_QUALITY',
  UNSAFE_REDIRECT: 'UNSAFE_REDIRECT',
  SPAM: 'SPAM',
  OTHER: 'OTHER',
} as const;
export type WatchReportReason = (typeof WatchReportReason)[keyof typeof WatchReportReason];

/**
 * Quality is only ever as good as the metadata behind it. A source that does
 * not publish a resolution stays UNKNOWN rather than being flattered to 1080p.
 */

export const WatchHealthVote = {
  WORKING: 'WORKING',
  BROKEN: 'BROKEN',
} as const;
export type WatchHealthVote = (typeof WatchHealthVote)[keyof typeof WatchHealthVote];

export const WatchHealthStatus = {
  HEALTHY: 'HEALTHY',
  WATCH: 'WATCH',
  DEGRADED: 'DEGRADED',
  POSSIBLY_UNAVAILABLE: 'POSSIBLY_UNAVAILABLE',
} as const;
export type WatchHealthStatus = (typeof WatchHealthStatus)[keyof typeof WatchHealthStatus];

export function watchHealthStatus(brokenRecent: number): WatchHealthStatus {
  if (brokenRecent >= 10) return WatchHealthStatus.POSSIBLY_UNAVAILABLE;
  if (brokenRecent >= 5) return WatchHealthStatus.DEGRADED;
  if (brokenRecent >= 3) return WatchHealthStatus.WATCH;
  return WatchHealthStatus.HEALTHY;
}

/** Bayesian score prevents one 5-star vote from outranking a proven source. */
export function weightedWatchRating(average: number | null, count: number): number {
  if (average === null || count <= 0) return 0;
  const prior = 3.5;
  const priorWeight = 5;
  return (average * count + prior * priorWeight) / (count + priorWeight);
}

export const QualityLabel = {
  UHD_4K: '4K',
  HD_1080P: '1080p',
  HD_720P: '720p',
  SD: 'SD',
  HD_CLAIMED: 'HD_CLAIMED',
  UNKNOWN: 'UNKNOWN',
} as const;
export type QualityLabel = (typeof QualityLabel)[keyof typeof QualityLabel];

export const AudioLabel = {
  SUB: 'SUB',
  DUB: 'DUB',
  SUB_DUB: 'SUB_DUB',
  UNKNOWN: 'UNKNOWN',
} as const;
export type AudioLabel = (typeof AudioLabel)[keyof typeof AudioLabel];

export const watchSourceTypeSchema = z.nativeEnum(WatchSourceType);
export const watchAccessTypeSchema = z.nativeEnum(WatchAccessType);
export const watchAvailabilityStatusSchema = z.nativeEnum(WatchAvailabilityStatus);
export const watchSourceOriginSchema = z.nativeEnum(WatchSourceOrigin);
export const watchReportReasonSchema = z.nativeEnum(WatchReportReason);
export const qualityLabelSchema = z.nativeEnum(QualityLabel);
export const audioLabelSchema = z.nativeEnum(AudioLabel);

/** Human-facing copy. Kept beside the enums so a new value cannot ship unlabelled. */
export const QUALITY_TEXT: Record<QualityLabel, string> = {
  '4K': '4K',
  '1080p': '1080p',
  '720p': '720p',
  SD: 'SD',
  HD_CLAIMED: 'HD claimed',
  UNKNOWN: 'Quality unknown',
};

export const AUDIO_TEXT: Record<AudioLabel, string> = {
  SUB: 'Sub',
  DUB: 'Dub',
  SUB_DUB: 'Sub / Dub',
  UNKNOWN: 'Audio unknown',
};

export const ACCESS_TEXT: Record<WatchAccessType, string> = {
  SUBSCRIPTION: 'Subscription',
  FREE: 'Free',
  FREE_WITH_ADS: 'Free + Ads',
  RENT: 'Rent',
  BUY: 'Buy',
  LIBRARY_CARD: 'Library card',
  UNKNOWN: 'Access unknown',
};

export const SOURCE_TYPE_TEXT: Record<WatchSourceType, string> = {
  OFFICIAL: 'Official',
  FREE_AD_SUPPORTED: 'Free with ads',
  RENT_BUY: 'Rent or buy',
  LIBRARY: 'Library',
  PUBLIC_DOMAIN: 'Public domain',
  COMMUNITY: 'Community',
  UNVERIFIED: 'Unverified',
};

export const AVAILABILITY_TEXT: Record<WatchAvailabilityStatus, string> = {
  AVAILABLE: 'Available',
  UNKNOWN: 'Availability unknown',
  RECENTLY_UNAVAILABLE: 'Recently unavailable',
};

/**
 * Shown above community/unverified entries. Transparency for the reader, not a
 * claim of legal cover.
 */
export const COMMUNITY_SOURCE_DISCLAIMER =
  'External websites are operated by third parties and are not hosted, controlled, or verified by Couchlist. Availability, legality, safety, quality, and content may vary by region. Couchlist does not host video files.';

/** Source tiers Couchlist presents as authorized. Everything else is community. */
const AUTHORIZED_TYPES: ReadonlySet<WatchSourceType> = new Set([
  WatchSourceType.OFFICIAL,
  WatchSourceType.FREE_AD_SUPPORTED,
  WatchSourceType.RENT_BUY,
  WatchSourceType.LIBRARY,
  WatchSourceType.PUBLIC_DOMAIN,
]);

export function isAuthorizedSourceType(type: WatchSourceType): boolean {
  return AUTHORIZED_TYPES.has(type);
}

/**
 * Only a small set of source types may ever play inside Couchlist, and only
 * when the record itself opts in. Everything else opens in a new tab.
 */
const EMBEDDABLE_TYPES: ReadonlySet<WatchSourceType> = new Set([
  WatchSourceType.PUBLIC_DOMAIN,
]);

export function canEmbedSource(input: {
  sourceType: WatchSourceType;
  allowsEmbed: boolean;
}): boolean {
  return input.allowsEmbed && EMBEDDABLE_TYPES.has(input.sourceType);
}
