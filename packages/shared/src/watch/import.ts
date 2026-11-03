import { normalizeDomain, parseExternalUrl } from './url.js';
import {
  WatchAccessType,
  WatchSourceOrigin,
  WatchSourceType,
  type WatchAccessType as AccessType,
  type WatchSourceOrigin as Origin,
  type WatchSourceType as SourceType,
} from './types.js';

/**
 * Bulk source import parsing.
 *
 * Pure functions: no database, no filesystem. The CLI and the dev UI both feed
 * text in here and get the same normalised result, so import behaviour cannot
 * drift between the two entry points.
 */

export interface ParsedSourceRow {
  /** Domain is always present because it is the import identity. */
  domain: string;
  /** Optional fields stay optional so updates only change values the operator supplied. */
  name?: string;
  homepageUrl?: string;
  sourceType?: SourceType;
  accessType?: AccessType;
  origin?: Origin;
  originUrl?: string | null;
  supportsAnime?: boolean;
  supportsMovies?: boolean;
  supportsTv?: boolean;
  supportsManga?: boolean;
  supportsManhwa?: boolean;
  supportsComics?: boolean;
  requiresAccount?: boolean;
  regionInfo?: string | null;
  isEnabled?: boolean;
  /** What a reader sees under the name. */
  description?: string | null;
  hasLotsOfAds?: boolean;
  shouldAvoid?: boolean;
  avoidReason?: string | null;
  qualityLabel?: string | null;
}

/** The six categories the directory has, as an operator would write them. */
export const IMPORT_CATEGORIES = [
  'Anime',
  'Movies',
  'TV',
  'Manga',
  'Manhwa',
  'Comics',
] as const;

const CATEGORY_FLAGS: Record<string, keyof ParsedSourceRow> = {
  ANIME: 'supportsAnime',
  MOVIES: 'supportsMovies',
  MOVIE: 'supportsMovies',
  FILM: 'supportsMovies',
  FILMS: 'supportsMovies',
  TV: 'supportsTv',
  SHOWS: 'supportsTv',
  SERIES: 'supportsTv',
  MANGA: 'supportsManga',
  MANHWA: 'supportsManhwa',
  WEBTOON: 'supportsManhwa',
  WEBTOONS: 'supportsManhwa',
  COMICS: 'supportsComics',
  COMIC: 'supportsComics',
};

/** Longest description an import may set, matching the suggestion form. */
export const IMPORT_DESCRIPTION_MAX = 240;
/** Longest quality label, matching the database constraint. */
export const IMPORT_QUALITY_MAX = 12;

export interface InvalidSourceRow {
  index: number;
  reason: string;
  raw: string;
}

export interface ParseResult {
  rows: ParsedSourceRow[];
  invalid: InvalidSourceRow[];
  /** Rows dropped because an earlier row in the same input had the same domain. */
  duplicates: number;
}

/**
 * Origin labels an operator may write, mapped onto the enum the database
 * already has. Recording where a list came from does not need its own column
 * per website, so anything directory-shaped collapses to DIRECTORY.
 */
const ORIGIN_ALIASES: Record<string, Origin> = {
  MANUAL: WatchSourceOrigin.MANUAL,
  COMMUNITY: WatchSourceOrigin.COMMUNITY,
  REDDIT: WatchSourceOrigin.COMMUNITY,
  DIRECTORY: WatchSourceOrigin.DIRECTORY,
  FMHY: WatchSourceOrigin.DIRECTORY,
  OFFICIAL_API: WatchSourceOrigin.OFFICIAL_API,
  OTHER: WatchSourceOrigin.OTHER,
};

const SOURCE_TYPES = new Set<string>(Object.values(WatchSourceType));
const ACCESS_TYPES = new Set<string>(Object.values(WatchAccessType));

/** Accepts true/false, yes/no, 1/0 and blank. Blank means "not stated". */
function readBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(text)) return true;
  if (['false', 'no', 'n', '0'].includes(text)) return false;
  return undefined;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function readString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

/**
 * Minimal CSV reader.
 *
 * Handles quoted fields, escaped quotes and embedded newlines, which is all an
 * import file needs. Not worth a dependency.
 */
export function parseCsv(input: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((entry) => entry.some((cell) => cell.trim() !== ''));
  const header = nonEmpty.shift();
  if (!header) return [];

  const keys = header.map((key) => key.trim());
  return nonEmpty.map((entry) => {
    const record: Record<string, string> = {};
    keys.forEach((key, index) => {
      record[key] = entry[index] ?? '';
    });
    return record;
  });
}


/**
 * Reads a categories field, however an operator wrote it.
 *
 * JSON lists, comma-separated, pipe-separated and semicolon-separated all
 * work, because a file assembled by hand from a forum thread will use
 * whichever the person felt like. Naming categories is the recommended way to
 * write an import: it says "these six and no others", where the individual
 * supportsX booleans quietly leave out whatever the author forgot.
 *
 * Returns the flags to set, or the first unrecognised word.
 */
export function readCategories(
  value: unknown,
): { ok: true; flags: Partial<ParsedSourceRow> } | { ok: false; unknown: string } | null {
  if (value === undefined || value === null || value === '') return null;

  const words = (Array.isArray(value) ? value : String(value).split(/[,|;]/))
    .map((entry) => String(entry).trim())
    .filter((entry) => entry !== '');
  if (words.length === 0) return null;

  // Naming any category means the row states all six, so an import can take a
  // category away as well as add one.
  const flags: Partial<ParsedSourceRow> = {
    supportsAnime: false,
    supportsMovies: false,
    supportsTv: false,
    supportsManga: false,
    supportsManhwa: false,
    supportsComics: false,
  };

  for (const word of words) {
    const key = CATEGORY_FLAGS[word.toUpperCase()];
    if (!key) return { ok: false, unknown: word };
    (flags as Record<string, boolean>)[key] = true;
  }

  return { ok: true, flags };
}


function normalizeRow(raw: Record<string, unknown>, index: number): ParsedSourceRow | InvalidSourceRow {
  const label = JSON.stringify(raw).slice(0, 200);
  const fail = (reason: string): InvalidSourceRow => ({ index, reason, raw: label });

  // A homepage URL is enough on its own; a bare domain is also accepted.
  // Keep track of whether the homepage was explicitly supplied so a later
  // domain-only update cannot overwrite a curated homepage URL.
  const explicitHomepage =
    readString(raw.homepageUrl) ?? readString(raw.homepage) ?? readString(raw.url);
  const statedDomain = readString(raw.domain);
  const validationUrl = explicitHomepage ?? (statedDomain ? `https://${statedDomain}` : undefined);

  if (!validationUrl) return fail('missing homepageUrl or domain');

  const parsed = parseExternalUrl(validationUrl);
  if (!parsed) return fail(`unsafe or invalid URL: ${validationUrl.slice(0, 80)}`);

  // An explicit domain field must agree with the URL, otherwise the row is
  // ambiguous about which site it describes.
  if (statedDomain) {
    const normalizedStated = normalizeDomain(statedDomain);
    if (!normalizedStated) return fail(`invalid domain: ${statedDomain.slice(0, 80)}`);
    if (normalizedStated !== parsed.domain) {
      return fail(`domain "${normalizedStated}" does not match URL host "${parsed.domain}"`);
    }
  }

  const sourceTypeRaw = readString(raw.sourceType);
  const sourceTypeInput = sourceTypeRaw?.toUpperCase();
  if (sourceTypeInput && !SOURCE_TYPES.has(sourceTypeInput)) {
    return fail(`unknown sourceType: ${sourceTypeInput}`);
  }

  const accessInput = readString(raw.accessType)?.toUpperCase();
  if (accessInput && !ACCESS_TYPES.has(accessInput)) {
    return fail(`unknown accessType: ${accessInput}`);
  }

  const originRaw = readString(raw.sourceOrigin) ?? readString(raw.origin);
  const originInput = originRaw?.toUpperCase();
  const origin = originInput ? ORIGIN_ALIASES[originInput] : undefined;
  if (originInput && !origin) return fail(`unknown sourceOrigin: ${originInput}`);

  const originUrlWasSupplied = hasOwn(raw, 'sourceOriginUrl') || hasOwn(raw, 'originUrl');
  const originUrlInput = readString(raw.sourceOriginUrl) ?? readString(raw.originUrl);
  if (originUrlInput && !parseExternalUrl(originUrlInput)) {
    return fail('sourceOriginUrl is not a valid http(s) URL');
  }

  const categories = readCategories(raw.categories);
  if (categories && !categories.ok) {
    return fail(
      `unknown category "${categories.unknown.slice(0, 40)}" (use ${IMPORT_CATEGORIES.join(', ')})`,
    );
  }

  const description = hasOwn(raw, 'description') ? (readString(raw.description) ?? null) : undefined;
  if (description && description.length > IMPORT_DESCRIPTION_MAX) {
    return fail(`description is ${description.length} characters; the limit is ${IMPORT_DESCRIPTION_MAX}`);
  }

  const qualityLabel = hasOwn(raw, 'qualityLabel')
    ? (readString(raw.qualityLabel) ?? null)
    : undefined;
  if (qualityLabel && qualityLabel.length > IMPORT_QUALITY_MAX) {
    return fail(`qualityLabel is ${qualityLabel.length} characters; the limit is ${IMPORT_QUALITY_MAX}`);
  }

  const shouldAvoid = readBoolean(raw.shouldAvoid);
  const avoidReason = hasOwn(raw, 'avoidReason') ? (readString(raw.avoidReason) ?? null) : undefined;
  if (shouldAvoid === true && !avoidReason) {
    // Marking a site as one to avoid without saying why gives a reader a red
    // banner and no information, which is worse than not marking it at all.
    return fail('shouldAvoid is true but avoidReason is missing');
  }

  return {
    domain: parsed.domain,
    name: hasOwn(raw, 'name') ? readString(raw.name) : undefined,
    homepageUrl: explicitHomepage ? parsed.url.toString() : undefined,
    sourceType: sourceTypeInput as SourceType | undefined,
    accessType: accessInput as AccessType | undefined,
    origin,
    originUrl: originUrlWasSupplied ? (originUrlInput ?? null) : undefined,
    // Individual flags still work, and win over the list when both appear, so
    // an older file keeps importing exactly as it did.
    ...(categories?.ok ? categories.flags : {}),
    supportsAnime: readBoolean(raw.supportsAnime) ?? (categories?.ok ? categories.flags.supportsAnime : undefined),
    supportsMovies: readBoolean(raw.supportsMovies) ?? (categories?.ok ? categories.flags.supportsMovies : undefined),
    supportsTv: readBoolean(raw.supportsTv) ?? (categories?.ok ? categories.flags.supportsTv : undefined),
    supportsManga: readBoolean(raw.supportsManga) ?? (categories?.ok ? categories.flags.supportsManga : undefined),
    supportsManhwa: readBoolean(raw.supportsManhwa) ?? (categories?.ok ? categories.flags.supportsManhwa : undefined),
    supportsComics: readBoolean(raw.supportsComics) ?? (categories?.ok ? categories.flags.supportsComics : undefined),
    requiresAccount: readBoolean(raw.requiresAccount),
    regionInfo: hasOwn(raw, 'regionInfo') ? (readString(raw.regionInfo) ?? null) : undefined,
    isEnabled: readBoolean(raw.isEnabled),
    description,
    hasLotsOfAds: readBoolean(raw.hasLotsOfAds),
    shouldAvoid,
    avoidReason,
    qualityLabel,
  };
}

function isInvalid(row: ParsedSourceRow | InvalidSourceRow): row is InvalidSourceRow {
  return 'reason' in row;
}

/**
 * Parses pasted or file text into normalised rows.
 *
 * Format is detected from the content rather than a flag, so the CLI and the UI
 * do not need to ask which one the operator meant.
 */
export function parseSourceImport(input: string): ParseResult {
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
    records = list.filter((entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null,
    );
  } else {
    records = parseCsv(text);
  }

  const rows: ParsedSourceRow[] = [];
  const invalid: InvalidSourceRow[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  records.forEach((record, index) => {
    const result = normalizeRow(record, index);
    if (isInvalid(result)) {
      invalid.push(result);
      return;
    }
    // Later rows for a domain already in this batch are dropped, so one file
    // cannot fight itself.
    if (seen.has(result.domain)) {
      duplicates += 1;
      return;
    }
    seen.add(result.domain);
    rows.push(result);
  });

  return { rows, invalid, duplicates };
}
