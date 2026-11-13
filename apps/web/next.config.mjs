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
  /*
   * Next writes AGENTS.md and CLAUDE.md into the app folder on every start.
   * Nobody asked for them, they are not part of this project, and they turn
   * up in a release archive looking like something that belongs there.
   */
  agentRules: false,
  // The shared and db packages ship TypeScript sources compiled to ESM.
  transpilePackages: ['@couchlist/shared', '@couchlist/db'],
  // `pg` is a native Node client and must not be bundled for the edge runtime.
  serverExternalPackages: ['pg', 'pg-native'],
  // No remote image hosts: the directory draws its own icons rather than
  // requesting one from every listed site, which would tell each of them who
  // is reading the list.
  images: { remotePatterns: [] },
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  /**
   * Redirects for the pages this rebuild retired.
   *
   * The paths people may have bookmarked or linked go somewhere useful instead
   * of 404ing. Permanent where the replacement is the obvious equivalent,
   * temporary where the destination may change.
   */
  async redirects() {
    return [
      // The old signed-in home and the title catalog both become Discover.
      { source: '/home', destination: '/', permanent: true },
      { source: '/search', destination: '/', permanent: true },
      { source: '/media/:path*', destination: '/', permanent: false },
      // Discord-era social pages.
      { source: '/friends', destination: '/', permanent: false },
      { source: '/watch-together', destination: '/', permanent: false },
      { source: '/my-server', destination: '/', permanent: false },
      { source: '/server/:path*', destination: '/', permanent: false },
      { source: '/compare/:path*', destination: '/', permanent: false },
      { source: '/private-testing', destination: '/', permanent: false },
      { source: '/dev/:path*', destination: '/', permanent: false },
      // The profile page is now account settings.
      { source: '/profile', destination: '/account', permanent: true },
      /*
       * The reader was at /tools/comics, which did not say what it was.
       * Links people already have keep working.
       */
      { source: '/tools/comics', destination: '/tools/read-manga', permanent: true },
    ];
  },
};

export default nextConfig;
