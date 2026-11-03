import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { icoToPng, isIco, readImageSize } from '@couchlist/shared';

/**
 * Converting a favicon.
 *
 * Nearly every site serves `/favicon.ico` and the directory stores PNG, JPEG
 * and WebP only, so this conversion is the difference between the icon button
 * working on most sites and failing on most sites.
 */

/** A real 1×1 PNG, used both on its own and embedded inside an ICO. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Builds an ICO directory around one or more already-encoded images. */
function buildIco(images: Array<{ width: number; height: number; data: Buffer; depth?: number }>) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = 6 + directory.length;
  const bodies: Buffer[] = [];

  images.forEach((image, index) => {
    const at = index * 16;
    directory[at] = image.width === 256 ? 0 : image.width;
    directory[at + 1] = image.height === 256 ? 0 : image.height;
    directory.writeUInt16LE(image.depth ?? 32, at + 6);
    directory.writeUInt32LE(image.data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += image.data.length;
    bodies.push(image.data);
  });

  return Buffer.concat([header, directory, ...bodies]);
}

/** A bottom-up 32-bit DIB, which is what an older ICO actually holds. */
function buildDib(width: number, height: number, colour: [number, number, number]) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(width, 4);
  header.writeInt32LE(height * 2, 8); // ICO states a doubled height
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);

  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = colour[2];
    pixels[index * 4 + 1] = colour[1];
    pixels[index * 4 + 2] = colour[0];
    pixels[index * 4 + 3] = 255;
  }

  return Buffer.concat([header, pixels]);
}

describe('recognising an ICO', () => {
  it('knows one when it sees one', () => {
    expect(isIco(buildIco([{ width: 16, height: 16, data: PNG }]))).toBe(true);
  });

  it('is not fooled by a PNG, a JPEG or an empty buffer', () => {
    expect(isIco(PNG)).toBe(false);
    expect(isIco(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe(false);
    expect(isIco(Buffer.alloc(0))).toBe(false);
  });
});

describe('converting an ICO to a PNG', () => {
  it('lifts out an embedded PNG untouched', () => {
    const converted = icoToPng(buildIco([{ width: 1, height: 1, data: PNG }]));
    expect(converted).not.toBeNull();
    expect(converted!.equals(PNG)).toBe(true);
  });

  it('encodes a real PNG from the bitmap an older ICO holds', () => {
    const ico = buildIco([{ width: 4, height: 4, data: buildDib(4, 4, [200, 30, 60]) }]);
    const converted = icoToPng(ico);

    expect(converted).not.toBeNull();
    // A PNG, by its own magic bytes, and the size the directory promised.
    expect(converted!.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(readImageSize(converted!)).toEqual({ width: 4, height: 4 });
  });

  it('takes the largest image when an ICO holds several', () => {
    const ico = buildIco([
      { width: 16, height: 16, data: buildDib(16, 16, [0, 0, 0]) },
      { width: 48, height: 48, data: buildDib(48, 48, [0, 0, 0]) },
      { width: 32, height: 32, data: buildDib(32, 32, [0, 0, 0]) },
    ]);

    expect(readImageSize(icoToPng(ico)!)).toEqual({ width: 48, height: 48 });
  });

  it('refuses a directory that points outside the file', () => {
    const ico = buildIco([{ width: 16, height: 16, data: PNG }]);
    ico.writeUInt32LE(99_999, 6 + 12); // an offset past the end
    expect(icoToPng(ico)).toBeNull();
  });

  it('returns nothing for a format it cannot read, rather than guessing', () => {
    // An 8-bit palette image: rare on the web, and not worth a decoder.
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeUInt16LE(8, 14);
    const ico = buildIco([{ width: 16, height: 16, data: header, depth: 8 }]);
    expect(icoToPng(ico)).toBeNull();
  });

  it('refuses something that is not an ICO at all', () => {
    expect(icoToPng(PNG)).toBeNull();
    expect(icoToPng(Buffer.from('not an image'))).toBeNull();
  });
});

describe('measuring an image without decoding it', () => {
  it('reads a PNG', () => {
    expect(readImageSize(PNG)).toEqual({ width: 1, height: 1 });
  });

  it('reads a JPEG from its frame header', () => {
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe0, 0x00, 0x10]),
      Buffer.alloc(14),
      Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x04, 0xb0]),
      Buffer.alloc(10),
    ]);
    expect(readImageSize(jpeg)).toEqual({ width: 1200, height: 600 });
  });

  it('reads a lossy WebP', () => {
    const webp = Buffer.alloc(32);
    webp.write('RIFF', 0, 'ascii');
    webp.write('WEBP', 8, 'ascii');
    webp.write('VP8 ', 12, 'ascii');
    webp.writeUInt16LE(640, 26);
    webp.writeUInt16LE(480, 28);
    expect(readImageSize(webp)).toEqual({ width: 640, height: 480 });
  });

  it('says nothing for bytes it does not recognise', () => {
    expect(readImageSize(Buffer.alloc(40))).toBeNull();
    expect(readImageSize(Buffer.from(deflateSync(Buffer.from('nonsense'))))).toBeNull();
  });
});
