/**
 * Package the extension into the zip the website serves.
 *
 * Built from source rather than committed as a binary, so the downloadable
 * file cannot drift away from the code that was reviewed. Run by the web
 * build, so a deploy always ships the current version.
 *
 * The archive is written here in plain Node instead of shelling out to `zip`.
 * The first version called `zip`, which exists on a developer's machine and
 * not in the deploy image, so the build died at `spawn zip ENOENT` — after
 * passing locally. Nothing in this file may assume a binary that Node itself
 * does not provide.
 *
 * Entries use a fixed timestamp so the same source always produces a
 * byte-identical archive, which makes "has the extension actually changed?"
 * answerable by comparing hashes.
 */
import { deflateRawSync } from 'node:zlib';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* ---------------------------------------------------------------- CRC-32 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------- ZIP */

// 1 Jan 2000, in DOS date/time. Fixed, so builds are reproducible.
const DOS_TIME = 0;
const DOS_DATE = ((2000 - 1980) << 9) | (1 << 5) | 1;

function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra
    locals.push(local, name, compressed);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4); // version made by
    header.writeUInt16LE(20, 6); // version needed
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(entry.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30); // extra
    header.writeUInt16LE(0, 32); // comment
    header.writeUInt16LE(0, 34); // disk
    header.writeUInt16LE(0, 36); // internal attrs
    header.writeUInt32LE(0, 38); // external attrs
    header.writeUInt32LE(offset, 42);
    central.push(header, name);

    offset += 30 + name.length + compressed.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with the directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment

  return Buffer.concat([...locals, directory, end]);
}

/* ------------------------------------------------------------------ build */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'extension');
const target = path.join(root, 'apps/web/public/couchlist-reader-extension.zip');

const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
const names = (await readdir(source)).filter((name) => !name.startsWith('.')).sort();

const entries = await Promise.all(
  names.map(async (name) => ({ name, data: await readFile(path.join(source, name)) })),
);

await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, zip(entries));
await writeFile(path.join(root, 'apps/web/public/.extension-version'), `${manifest.version}\n`);

process.stdout.write(
  `Extension ${manifest.version} packaged: ${entries.length} files -> ${path.relative(root, target)}\n`,
);
