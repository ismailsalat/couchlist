import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCbz,
  chooseCuts,
  crc32,
  imageEntries,
  imageExtension,
  pageName,
  readArchiveEntry,
  readArchiveIndex,
} from '@couchlist/shared';

/**
 * The archive is checked with the real `unzip`, not with a reader written
 * alongside the writer. A matched pair of my own code would agree with itself
 * about a malformed file; a comic reader would not.
 */

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 9, 9, 9);

describe('crc32', () => {
  it('matches the known value for a standard input', () => {
    // "123456789" has a published CRC-32 of 0xCBF43926.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for nothing', () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('page naming', () => {
  it('pads so a reader sorting by text still reads in order', () => {
    expect(pageName(0, 12, 'jpg')).toBe('001.jpg');
    expect(pageName(9, 12, 'jpg')).toBe('010.jpg');
    // The failure this prevents: "2" sorting after "10".
    const names = Array.from({ length: 12 }, (_, i) => pageName(i, 12, 'jpg'));
    expect([...names].sort()).toEqual(names);
  });

  it('widens for a long chapter', () => {
    expect(pageName(0, 1_500, 'png')).toBe('0001.png');
    const names = Array.from({ length: 1_500 }, (_, i) => pageName(i, 1_500, 'png'));
    expect([...names].sort()).toEqual(names);
  });

  it('tolerates an extension written with or without a dot', () => {
    expect(pageName(0, 1, '.JPG')).toBe('001.jpg');
  });
});

describe('image sniffing', () => {
  it('knows the formats a chapter actually arrives in', () => {
    expect(imageExtension(PNG)).toBe('png');
    expect(imageExtension(JPG)).toBe('jpg');
    expect(imageExtension(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe('webp');
    expect(imageExtension(bytes(0x47, 0x49, 0x46, 0x38))).toBe('gif');
  });

  it('returns null for something that is not an image', () => {
    expect(imageExtension(new TextEncoder().encode('hello there'))).toBeNull();
  });
});

describe('buildCbz', () => {
  it('produces an archive that real unzip accepts', () => {
    const archive = buildCbz([
      { name: '001.png', bytes: PNG },
      { name: '002.jpg', bytes: JPG },
    ]);

    const dir = mkdtempSync(join(tmpdir(), 'cbz-'));
    const file = join(dir, 'chapter.cbz');
    writeFileSync(file, archive);

    // -t tests integrity, including every CRC. A wrong checksum fails here.
    const tested = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
    expect(tested).toContain('No errors detected');

    const listed = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });
    expect(listed).toContain('001.png');
    expect(listed).toContain('002.jpg');
  });

  it('round-trips the exact bytes of every page', () => {
    const archive = buildCbz([
      { name: '001.png', bytes: PNG },
      { name: '002.jpg', bytes: JPG },
    ]);

    const dir = mkdtempSync(join(tmpdir(), 'cbz-'));
    const file = join(dir, 'chapter.cbz');
    writeFileSync(file, archive);
    execFileSync('unzip', ['-q', '-o', file, '-d', dir]);

    expect(new Uint8Array(readFileSync(join(dir, '001.png')))).toEqual(PNG);
    expect(new Uint8Array(readFileSync(join(dir, '002.jpg')))).toEqual(JPG);
  });

  it('refuses to build a comic with no pages', () => {
    // A zero-entry zip is valid and opens to nothing, which is worse than an
    // error: the person finds out when their reader shows a blank chapter.
    expect(() => buildCbz([])).toThrow(/at least one page/u);
  });

  it('refuses two pages with the same name', () => {
    expect(() =>
      buildCbz([
        { name: '001.png', bytes: PNG },
        { name: '001.png', bytes: JPG },
      ]),
    ).toThrow(/both called/u);
  });

  it('keeps a large page intact', () => {
    const big = new Uint8Array(300_000).map((_, index) => index % 251);
    const archive = buildCbz([{ name: '001.jpg', bytes: big }]);

    const dir = mkdtempSync(join(tmpdir(), 'cbz-'));
    const file = join(dir, 'big.cbz');
    writeFileSync(file, archive);
    execFileSync('unzip', ['-q', '-o', file, '-d', dir]);

    expect(new Uint8Array(readFileSync(join(dir, '001.jpg')))).toEqual(big);
  });
});

describe('chooseCuts', () => {
  it('leaves a short strip alone', () => {
    expect(chooseCuts(1_200, 1_600, [])).toEqual([]);
  });

  it('cuts on a gutter when one is near the ideal', () => {
    // Ideal boundary is 1600; a gutter at 1650 is close enough to prefer.
    expect(chooseCuts(5_000, 1_600, [1_650, 3_300])).toEqual([1_650, 3_300]);
  });

  it('falls back to the plain interval when no gutter is close', () => {
    expect(chooseCuts(4_000, 1_600, [50, 90])).toEqual([1_600, 3_200]);
  });

  it('never leaves a sliver at the end', () => {
    const cuts = chooseCuts(3_400, 1_600, []);
    const last = cuts[cuts.length - 1] ?? 0;
    expect(3_400 - last).toBeGreaterThan(1_600 * 0.35);
  });

  it('never cuts at the very start or the very end', () => {
    for (const cut of chooseCuts(9_000, 1_500, [])) {
      expect(cut).toBeGreaterThan(0);
      expect(cut).toBeLessThan(9_000);
    }
  });
});

describe('reading an archive', () => {
  /** Inflate via Node's zlib, standing in for the browser's DecompressionStream. */
  async function inflateRaw(input: Uint8Array): Promise<Uint8Array> {
    const { inflateRawSync } = await import('node:zlib');
    return new Uint8Array(inflateRawSync(input));
  }

  /** An archive made by the real `zip` command, not by our own writer. */
  function realZip(files: Record<string, Buffer>, extraArgs: string[] = []): Uint8Array {
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(dir, name), body);
    }
    const archive = join(dir, 'made.cbz');
    execFileSync('zip', ['-q', ...extraArgs, archive, ...Object.keys(files)], { cwd: dir });
    return new Uint8Array(readFileSync(archive));
  }

  it('reads a deflated archive made by the zip command', async () => {
    // Highly compressible, so `zip` really does deflate it rather than store it.
    const body = Buffer.from('A'.repeat(5_000));
    const archive = realZip({ '001.png': Buffer.concat([Buffer.from(PNG), body]) });

    const entries = readArchiveIndex(archive);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.method).toBe(8);

    const out = await readArchiveEntry(archive, entries[0]!, inflateRaw);
    expect(out.length).toBe(PNG.length + body.length);
    expect(out.subarray(0, 4)).toEqual(PNG.subarray(0, 4));
  });

  it('reads a stored archive too', async () => {
    const archive = realZip({ '001.png': Buffer.from(PNG) }, ['-0']);
    const entries = readArchiveIndex(archive);
    expect(entries[0]?.method).toBe(0);
    expect(await readArchiveEntry(archive, entries[0]!, inflateRaw)).toEqual(PNG);
  });

  it('reads back what our own writer produced', async () => {
    const archive = buildCbz([
      { name: '001.png', bytes: PNG },
      { name: '002.jpg', bytes: JPG },
    ]);
    const entries = readArchiveIndex(archive);
    expect(entries.map((entry) => entry.name)).toEqual(['001.png', '002.jpg']);
    expect(await readArchiveEntry(archive, entries[1]!, inflateRaw)).toEqual(JPG);
  });

  it('refuses something that is not an archive', () => {
    expect(() => readArchiveIndex(new TextEncoder().encode('just some text'))).toThrow(
      /does not look like/u,
    );
  });

  it('ignores folders and the junk archivers add', () => {
    const archive = realZip({
      '002.jpg': Buffer.from(JPG),
      '001.png': Buffer.from(PNG),
      'notes.txt': Buffer.from('not a page'),
    });

    const pages = imageEntries(readArchiveIndex(archive));
    expect(pages.map((entry) => entry.name)).toEqual(['001.png', '002.jpg']);
  });

  it('puts pages in reading order even when the archive does not', () => {
    const archive = realZip({
      'page10.png': Buffer.from(PNG),
      'page2.png': Buffer.from(PNG),
      'page1.png': Buffer.from(PNG),
    });

    expect(imageEntries(readArchiveIndex(archive)).map((entry) => entry.name)).toEqual([
      'page1.png',
      'page2.png',
      'page10.png',
    ]);
  });
});
