import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readArchiveEntry, readArchiveIndex } from '@couchlist/shared';

/**
 * The extension download is produced by the build, so if this breaks the
 * deploy breaks — which it already did once.
 *
 * Two real bugs are pinned here. The first version shelled out to `zip`,
 * which exists on a developer's machine and not in the deploy image, so the
 * build died with `spawn zip ENOENT` after passing locally. The rewrite then
 * used a mistyped CRC-32 polynomial and produced an archive that every tool
 * rejected — valid-looking, completely broken.
 *
 * So this runs the real script and reads the result back with Couchlist's own
 * archive reader. An archive that cannot be opened fails here rather than in
 * somebody's browser.
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const script = `${root}scripts/build-extension.mjs`;
const archive = `${root}apps/web/public/couchlist-reader-extension.zip`;

describe('packaging the extension', () => {
  it('builds a readable archive using nothing but Node', () => {
    // An empty PATH: if the script reaches for any binary, this fails.
    execFileSync(process.execPath, [script], {
      cwd: root,
      env: { PATH: '', HOME: process.env.HOME ?? '/tmp' },
    });

    const bytes = new Uint8Array(readFileSync(archive));
    const entries = readArchiveIndex(bytes);
    const names = entries.map((entry) => entry.name).sort();

    expect(names).toEqual([
      'background.js',
      'bridge.js',
      'collect.js',
      'icon128.png',
      'manifest.json',
      'popup.css',
      'popup.js',
      'popup.html',
    ].sort());
  });

  it('round-trips the manifest, so the compression is actually correct', async () => {
    const bytes = new Uint8Array(readFileSync(archive));
    const entries = readArchiveIndex(bytes);
    const entry = entries.find((item) => item.name === 'manifest.json');
    expect(entry).toBeDefined();

    const raw = await readArchiveEntry(bytes, entry!, async (input) =>
      new Uint8Array(inflateRawSync(input)),
    );
    const manifest = JSON.parse(new TextDecoder().decode(raw)) as {
      manifest_version: number;
      permissions: string[];
      optional_host_permissions: string[];
    };

    expect(manifest.manifest_version).toBe(3);
    // The permission promises on the extension page have to stay true.
    // The extension page promises site access is asked for one site at a
    // time, so nothing may be granted up front.
    expect(manifest.permissions).not.toContain('tabs');
    expect(manifest).not.toHaveProperty('host_permissions');
    expect(manifest.optional_host_permissions).toEqual(['https://*/*']);
  });
});
