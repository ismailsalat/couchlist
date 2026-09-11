import {
  canonicalAnimeKeyFromMalId,
  parseAvailabilityImport,
  type InvalidAvailabilityRow,
  type ParsedAvailabilityRow,
} from '@couchlist/shared';
import type { WatchSourceRepository } from './repositories/watch-sources.js';

export interface AvailabilityImportPreview {
  rows: number;
  create: number;
  update: number;
  duplicates: number;
  invalid: InvalidAvailabilityRow[];
}

export interface AvailabilityImportOutcome extends AvailabilityImportPreview {
  applied: boolean;
  created: number;
  updated: number;
  failed: Array<{ contentKey: string; domain: string; reason: string }>;
}

interface ResolvedRow {
  row: ParsedAvailabilityRow;
  sourceId: string;
}

async function resolveRows(
  repository: WatchSourceRepository,
  input: string,
): Promise<{
  rows: ResolvedRow[];
  invalid: InvalidAvailabilityRow[];
  duplicates: number;
}> {
  const parsed = parseAvailabilityImport(input);
  const sourceMap = await repository.findSourcesByDomains(parsed.rows.map((row) => row.domain));
  const rows: ResolvedRow[] = [];
  const invalid = [...parsed.invalid];

  for (const row of parsed.rows) {
    const source = sourceMap.get(row.domain);
    if (!source) {
      invalid.push({
        index: rows.length,
        reason: `unknown source domain: ${row.domain}; import the source registry first`,
        raw: JSON.stringify(row).slice(0, 200),
      });
      continue;
    }
    rows.push({ row, sourceId: source.id });
  }

  return { rows, invalid, duplicates: parsed.duplicates };
}

async function classify(
  repository: WatchSourceRepository,
  rows: ResolvedRow[],
): Promise<{ create: ResolvedRow[]; update: ResolvedRow[] }> {
  const create: ResolvedRow[] = [];
  const update: ResolvedRow[] = [];
  for (const entry of rows) {
    const existing = await repository.findAvailability(entry.row.contentKey, entry.sourceId);
    (existing ? update : create).push(entry);
  }
  return { create, update };
}

export async function previewAvailabilityImport(
  repository: WatchSourceRepository,
  input: string,
): Promise<AvailabilityImportPreview> {
  const resolved = await resolveRows(repository, input);
  const { create, update } = await classify(repository, resolved.rows);
  return {
    rows: resolved.rows.length + resolved.invalid.length + resolved.duplicates,
    create: create.length,
    update: update.length,
    duplicates: resolved.duplicates,
    invalid: resolved.invalid,
  };
}

export async function applyAvailabilityImport(
  repository: WatchSourceRepository,
  input: string,
): Promise<AvailabilityImportOutcome> {
  const resolved = await resolveRows(repository, input);
  const { create, update } = await classify(repository, resolved.rows);
  const existingKeys = new Set(update.map(({ row, sourceId }) => `${row.contentKey}:${sourceId}`));

  let created = 0;
  let updated = 0;
  const failed: Array<{ contentKey: string; domain: string; reason: string }> = [];

  for (const { row, sourceId } of resolved.rows) {
    try {
      const canonicalMediaKey = row.mediaType === 'ANIME'
        ? canonicalAnimeKeyFromMalId(row.contentKey.split(':')[2] ?? '')
        : null;
      await repository.upsertImportedAvailability({
        watchSourceId: sourceId,
        contentKey: row.contentKey,
        mediaType: row.mediaType,
        canonicalMediaKey,
        availabilityUrl: row.availabilityUrl,
        accessType: row.accessType,
        quality: row.quality,
        audio: row.audio,
        priceLabel: row.priceLabel,
        availabilityStatus: row.availabilityStatus,
      });
      const key = `${row.contentKey}:${sourceId}`;
      if (existingKeys.has(key)) updated += 1;
      else created += 1;
    } catch (error) {
      failed.push({
        contentKey: row.contentKey,
        domain: row.domain,
        reason: (error as Error).message,
      });
    }
  }

  return {
    applied: true,
    rows: resolved.rows.length + resolved.invalid.length + resolved.duplicates,
    create: create.length,
    update: update.length,
    duplicates: resolved.duplicates,
    invalid: resolved.invalid,
    created,
    updated,
    failed,
  };
}
