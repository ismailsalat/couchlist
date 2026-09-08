import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads the repository-root .env for local tests without adding another runtime
 * dependency. Existing environment variables always win, so CI can inject its
 * own secrets safely.
 */
const envPath = resolve(process.cwd(), '.env');

if (existsSync(envPath)) {
  const contents = readFileSync(envPath, 'utf8');

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(separator + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);

    process.env[key] = value;
  }
}
