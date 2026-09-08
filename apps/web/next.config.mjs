import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// npm workspaces execute Next from apps/web, while Couchlist keeps one .env at
// the repository root. Load the nearest .env before Next reads process.env.
// Real environment variables always win, so Railway remains authoritative.
function loadProjectEnv(startDir = process.cwd()) {
  let dir = startDir;

  while (true) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      const text = readFileSync(candidate, 'utf8').replace(/^\uFEFF/, '');
      for (const rawLine of text.split(/\r?\n/)) {
        let line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        if (line.startsWith('export ')) line = line.slice(7).trim();

        const equals = line.indexOf('=');
        if (equals <= 0) continue;
        const key = line.slice(0, equals).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;

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
      return;
    }

    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

loadProjectEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared and db packages ship TypeScript sources compiled to ESM.
  transpilePackages: ['@couchlist/shared', '@couchlist/db'],
  // `pg` is a native Node client and must not be bundled for the edge runtime.
  serverExternalPackages: ['pg', 'pg-native'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 's4.anilist.co' },
      { protocol: 'https', hostname: 'image.tmdb.org' },
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
    ],
  },
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
};

export default nextConfig;
