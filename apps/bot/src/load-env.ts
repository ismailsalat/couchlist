import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Loads the nearest .env file by walking upward from the current workspace.
 * Existing environment variables always win, which keeps Railway/container
 * configuration authoritative in production.
 */
export function loadProjectEnv(startDir: string = process.cwd()): string | null {
  let dir = startDir;

  while (true) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      applyEnvFile(candidate);
      return candidate;
    }

    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function applyEnvFile(path: string): void {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();

    const equals = line.indexOf('=');
    if (equals <= 0) continue;

    const key = line.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;

    let value = line.slice(equals + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
