import { canonicalizeExternalUrl, normalizeDomain } from './url.js';
import { parseCsv } from './import.js';
import {
  AudioLabel,
  QualityLabel,
  WatchAccessType,
  WatchAvailabilityStatus,
  type AudioLabel as Audio,
  type QualityLabel as Quality,
  type WatchAccessType as AccessType,
  type WatchAvailabilityStatus as AvailabilityStatus,
} from './types.js';
import type { MediaType } from '../media/identity.js';

export interface ParsedAvailabilityRow {
  contentKey: string;
  mediaType: MediaType;
  domain: string;
  availabilityUrl: string;
  accessType?: AccessType;
  quality?: Quality;
  audio?: Audio;
  availabilityStatus?: AvailabilityStatus;
  priceLabel?: string | null;
}

export interface InvalidAvailabilityRow {
  index: number;
  reason: string;
  raw: string;
}

export interface AvailabilityParseResult {
  rows: ParsedAvailabilityRow[];
  invalid: InvalidAvailabilityRow[];
  duplicates: number;
}

const ACCESS_TYPES = new Set<string>(Object.values(WatchAccessType));
const QUALITY_TYPES = new Set<string>(Object.values(QualityLabel));
const AUDIO_TYPES = new Set<string>(Object.values(AudioLabel));
const AVAILABILITY_TYPES = new Set<string>(Object.values(WatchAvailabilityStatus));

function readString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function mediaTypeFromContentKey(contentKey: string): MediaType | null {
  if (/^CANONICAL:mal:\d+$/u.test(contentKey)) return 'ANIME';
  if (/^TMDB:MOVIE:\d+$/u.test(contentKey)) return 'MOVIE';
  if (/^TMDB:TV:\d+$/u.test(contentKey)) return 'TV';
  return null;
}

function normalizeRow(
  raw: Record<string, unknown>,
  index: number,
): ParsedAvailabilityRow | InvalidAvailabilityRow {
  const label = JSON.stringify(raw).slice(0, 200);
  const fail = (reason: string): InvalidAvailabilityRow => ({ index, reason, raw: label });

  const contentKey = readString(raw.contentKey);
  if (!contentKey) return fail('missing contentKey');

  const mediaType = mediaTypeFromContentKey(contentKey);
  if (!mediaType) {
    return fail('contentKey must be CANONICAL:mal:<id>, TMDB:MOVIE:<id>, or TMDB:TV:<id>');
  }

  const domainInput = readString(raw.domain);
  if (!domainInput) return fail('missing domain');
  const domain = normalizeDomain(domainInput);
  if (!domain) return fail(`invalid domain: ${domainInput.slice(0, 80)}`);

  const availabilityInput = readString(raw.availabilityUrl) ?? readString(raw.url);
  if (!availabilityInput) return fail('missing availabilityUrl');
  const availabilityUrl = canonicalizeExternalUrl(availabilityInput);
  if (!availabilityUrl) return fail('availabilityUrl is not a safe http(s) URL');

  const urlDomain = normalizeDomain(availabilityUrl);
  if (!urlDomain) return fail('availabilityUrl domain could not be normalized');
  if (urlDomain !== domain) {
    return fail(`domain "${domain}" does not match availability URL host "${urlDomain}"`);
  }

  const accessInput = readString(raw.accessType)?.toUpperCase();
  if (accessInput && !ACCESS_TYPES.has(accessInput)) {
    return fail(`unknown accessType: ${accessInput}`);
  }

  const qualityInput = readString(raw.quality ?? raw.qualityLabel);
  if (qualityInput && !QUALITY_TYPES.has(qualityInput)) {
    return fail(`unknown quality: ${qualityInput}`);
  }

  const audioInput = readString(raw.audio ?? raw.audioLabel)?.toUpperCase();
  if (audioInput && !AUDIO_TYPES.has(audioInput)) {
    return fail(`unknown audio: ${audioInput}`);
  }

  const statusInput = readString(raw.availabilityStatus)?.toUpperCase();
  if (statusInput && !AVAILABILITY_TYPES.has(statusInput)) {
    return fail(`unknown availabilityStatus: ${statusInput}`);
  }

  return {
    contentKey,
    mediaType,
    domain,
    availabilityUrl,
    accessType: accessInput as AccessType | undefined,
    quality: qualityInput as Quality | undefined,
    audio: audioInput as Audio | undefined,
    availabilityStatus: statusInput as AvailabilityStatus | undefined,
    priceLabel:
      Object.prototype.hasOwnProperty.call(raw, 'priceLabel')
        ? (readString(raw.priceLabel) ?? null)
        : undefined,
  };
}

function isInvalid(
  row: ParsedAvailabilityRow | InvalidAvailabilityRow,
): row is InvalidAvailabilityRow {
  return 'reason' in row;
}

export function parseAvailabilityImport(input: string): AvailabilityParseResult {
  const text = input.trim();
  if (!text) return { rows: [], invalid: [], duplicates: 0 };

  let records: Array<Record<string, unknown>>;
  if (text.startsWith('[') || text.startsWith('{')) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      return {
        rows: [],
        invalid: [{ index: 0, reason: `invalid JSON: ${(error as Error).message}`, raw: '' }],
        duplicates: 0,
      };
    }
    const list = Array.isArray(json) ? json : [json];
    records = list.filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
    );
  } else {
    records = parseCsv(text);
  }

  const rows: ParsedAvailabilityRow[] = [];
  const invalid: InvalidAvailabilityRow[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  records.forEach((record, index) => {
    const result = normalizeRow(record, index);
    if (isInvalid(result)) {
      invalid.push(result);
      return;
    }
    const key = `${result.contentKey}:${result.domain}`;
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.add(key);
    rows.push(result);
  });

  return { rows, invalid, duplicates };
}
