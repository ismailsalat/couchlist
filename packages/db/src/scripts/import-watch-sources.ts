import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabase } from '../client.js';
import { loadProjectEnv } from '../load-env.js';
import { WatchSourceRepository } from '../repositories/watch-sources.js';
import { applySourceImport, previewSourceImport } from '../watch-import.js';

/**
 * Bulk source import from a JSON or CSV file.
 *
 *   npm run watch:sources:import -- sources.json
 *   npm run watch:sources:import -- sources.csv --dry-run
 *
 * A thin wrapper: all behaviour lives in the shared import service so the CLI
 * and the dev UI cannot diverge. Paths resolve against the current working
 * directory, so nothing here is machine-specific.
 */
function report(result: Awaited<ReturnType<typeof previewSourceImport>>): void {
  process.stdout.write(`\n  Rows:       ${result.rows}\n`);
  process.stdout.write(`  New:        ${result.create}\n`);
  process.stdout.write(`  Updates:    ${result.update}\n`);
  process.stdout.write(`  Duplicates: ${result.duplicates}\n`);
  process.stdout.write(`  Invalid:    ${result.invalid.length}\n`);

  if (result.invalid.length > 0) {
    process.stdout.write('\n  Rejected rows:\n');
    for (const row of result.invalid.slice(0, 20)) {
      process.stdout.write(`    [${row.index}] ${row.reason}\n`);
    }
    if (result.invalid.length > 20) {
      process.stdout.write(`    ...and ${result.invalid.length - 20} more\n`);
    }
  }
}

async function main(): Promise<void> {
  loadProjectEnv();

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = args.find((arg) => !arg.startsWith('--'));

  if (!file) {
    process.stderr.write('\nUsage: npm run watch:sources:import -- <file.json|file.csv> [--dry-run]\n\n');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write('\nDATABASE_URL is not set.\n\n');
    process.exit(1);
  }

  let contents: string;
  try {
    contents = readFileSync(resolve(process.cwd(), file), 'utf8');
  } catch (error) {
    process.stderr.write(`\nCould not read ${file}: ${(error as Error).message}\n\n`);
    process.exit(1);
    return;
  }

  const db = createDatabase({ connectionString: url, ssl: !/localhost|127\.0\.0\.1/.test(url) });
  const repository = new WatchSourceRepository(db);

  if (dryRun) {
    const preview = await previewSourceImport(repository, contents);
    process.stdout.write(`\nDry run - nothing was written.\n`);
    report(preview);
    process.stdout.write('\n');
    process.exit(0);
  }

  const outcome = await applySourceImport(repository, contents);
  process.stdout.write(`\nImport applied.\n`);
  report(outcome);
  process.stdout.write(`\n  Created:    ${outcome.created}\n`);
  process.stdout.write(`  Updated:    ${outcome.updated}\n`);

  if (outcome.failed.length > 0) {
    process.stdout.write(`  Failed:     ${outcome.failed.length}\n`);
    for (const failure of outcome.failed.slice(0, 20)) {
      process.stdout.write(`    ${failure.domain}: ${failure.reason}\n`);
    }
  }

  // Imported sources arrive disabled unless the input says otherwise, so a
  // large import cannot silently go live on media pages.
  process.stdout.write('\nSources are disabled until enabled explicitly unless the import set isEnabled=true.\n\n');
  process.exit(outcome.failed.length > 0 ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
