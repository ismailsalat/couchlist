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
  requiresAccount?: boolean;
  regionInfo?: string | null;
  isEnabled?: boolean;
}

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

  return {
    domain: parsed.domain,
    name: hasOwn(raw, 'name') ? readString(raw.name) : undefined,
    homepageUrl: explicitHomepage ? parsed.url.toString() : undefined,
    sourceType: sourceTypeInput as SourceType | undefined,
    accessType: accessInput as AccessType | undefined,
    origin,
    originUrl: originUrlWasSupplied ? (originUrlInput ?? null) : undefined,
    supportsAnime: readBoolean(raw.supportsAnime),
    supportsMovies: readBoolean(raw.supportsMovies),
    supportsTv: readBoolean(raw.supportsTv),
    requiresAccount: readBoolean(raw.requiresAccount),
    regionInfo: hasOwn(raw, 'regionInfo') ? (readString(raw.regionInfo) ?? null) : undefined,
    isEnabled: readBoolean(raw.isEnabled),
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
