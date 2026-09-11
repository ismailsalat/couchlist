import { parseSourceImport, type InvalidSourceRow, type ParsedSourceRow } from '@couchlist/shared';
import type { WatchSourceRepository } from './repositories/watch-sources.js';

/**
 * Bulk source import.
 *
 * One code path for both entry points: the CLI and the dev UI call `preview`
 * and `apply` here. Preview performs reads only, so an operator can always see
 * what an import would do before anything is written.
 */

export interface ImportPreview {
  rows: number;
  create: number;
  update: number;
  /** Rows removed because the same domain appeared twice in the input. */
  duplicates: number;
  invalid: InvalidSourceRow[];
  /** Domains that would be inserted, for a quick eyeball before applying. */
  newDomains: string[];
}

export interface ImportOutcome extends ImportPreview {
  applied: boolean;
  created: number;
  updated: number;
  failed: Array<{ domain: string; reason: string }>;
}

async function classify(
  repository: WatchSourceRepository,
  rows: ParsedSourceRow[],
): Promise<{ create: ParsedSourceRow[]; update: ParsedSourceRow[] }> {
  const existing = await repository.findSourcesByDomains(rows.map((row) => row.domain));
  const create: ParsedSourceRow[] = [];
  const update: ParsedSourceRow[] = [];

  for (const row of rows) {
    (existing.has(row.domain) ? update : create).push(row);
  }
  return { create, update };
}

/** Read-only. Nothing is written, including for rows that would be created. */
export async function previewSourceImport(
  repository: WatchSourceRepository,
  input: string,
): Promise<ImportPreview> {
  const parsed = parseSourceImport(input);
  const { create, update } = await classify(repository, parsed.rows);

  return {
    rows: parsed.rows.length + parsed.invalid.length + parsed.duplicates,
    create: create.length,
    update: update.length,
    duplicates: parsed.duplicates,
    invalid: parsed.invalid,
    newDomains: create.map((row) => row.domain).slice(0, 50),
  };
}

/**
 * Writes the import.
 *
 * Rows are upserted on normalised domain, so running the same input twice
 * produces updates rather than duplicates. One bad row does not abort the rest.
 */
export async function applySourceImport(
  repository: WatchSourceRepository,
  input: string,
): Promise<ImportOutcome> {
  const parsed = parseSourceImport(input);
  const { create, update } = await classify(repository, parsed.rows);

  let created = 0;
  let updated = 0;
  const failed: Array<{ domain: string; reason: string }> = [];
  const existingDomains = new Set(update.map((row) => row.domain));

  for (const row of parsed.rows) {
    try {
      await repository.upsertImportedSource(row);
      if (existingDomains.has(row.domain)) updated += 1;
      else created += 1;
    } catch (error) {
      failed.push({ domain: row.domain, reason: (error as Error).message });
    }
  }

  return {
    applied: true,
    rows: parsed.rows.length + parsed.invalid.length + parsed.duplicates,
    create: create.length,
    update: update.length,
    duplicates: parsed.duplicates,
    invalid: parsed.invalid,
    newDomains: create.map((row) => row.domain).slice(0, 50),
    created,
    updated,
    failed,
  };
}
