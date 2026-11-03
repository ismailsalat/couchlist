import { sniffImageMime } from './icon.js';

/**
 * Getting a usable image out of a `.ico` file.
 *
 * Nearly every site still serves `/favicon.ico`, and this directory stores
 * PNG, JPEG and WebP only. So refusing `.ico` would mean the automatic icon
 * button failing on most of the web — which is the whole reason this exists.
 *
 * Two shapes to handle. Since Windows Vista an entry may hold a complete PNG,
 * and modern favicons usually do: that PNG *is* the icon, lifted out
 * untouched. Older files hold a bottom-up DIB bitmap, which is decoded and
 * re-encoded here.
 *
 * The PNG encoder writes uncompressed deflate blocks rather than reaching for
 * `node:zlib`. This module is part of a package the browser bundle also
 * imports, and a Node builtin in that path breaks the build; an icon is a few
 * kilobytes either way, so the compression would buy nothing worth the
 * dependency.
 */

const HEADER_BYTES = 6;
const ENTRY_BYTES = 16;

/** Beyond this an "icon" is something else wearing an icon's header. */
const MAX_ENTRIES = 64;
const MAX_SIDE = 1024;

/** Whether these bytes are an icon container at all. */
export function isIco(bytes: Buffer): boolean {
  return bytes.length > HEADER_BYTES && bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1;
}

interface Entry {
  width: number;
  height: number;
  data: Buffer;
}

/** The directory entries that point at real data inside the file. */
function readDirectory(bytes: Buffer): Entry[] {
  const count = bytes.readUInt16LE(4);
  if (count === 0 || count > MAX_ENTRIES) return [];

  const entries: Entry[] = [];

  for (let index = 0; index < count; index += 1) {
    const at = HEADER_BYTES + index * ENTRY_BYTES;
    if (at + ENTRY_BYTES > bytes.length) break;

    // Zero means 256 in an icon directory, which is the one quirk here.
    const width = bytes[at] === 0 ? 256 : bytes[at]!;
    const height = bytes[at + 1] === 0 ? 256 : bytes[at + 1]!;
    const size = bytes.readUInt32LE(at + 8);
    const offset = bytes.readUInt32LE(at + 12);

    // A directory that points outside the file is not one to guess about.
    if (size === 0 || offset + size > bytes.length) continue;

    entries.push({ width, height, data: bytes.subarray(offset, offset + size) });
  }

  return entries;
}

/**
 * The best image inside an `.ico`, as a PNG, or null when there is none.
 *
 * Largest first: an icon file usually holds 16, 32, 48 and 180 pixel
 * versions, and a listing shows it at 48, so the biggest is the one that
 * still looks right.
 */
export function icoToPng(bytes: Buffer): Buffer<ArrayBuffer> | null {
  if (!isIco(bytes)) return null;

  const entries = readDirectory(bytes).sort((a, b) => b.width * b.height - a.width * a.height);

  for (const entry of entries) {
    if (sniffImageMime(entry.data) === 'image/png') {
      return Buffer.from(entry.data);
    }

    const encoded = dibToPng(entry.data);
    if (encoded) return encoded;
  }

  return null;
}

/**
 * A bitmap entry, decoded and re-encoded as a PNG.
 *
 * Only 32- and 24-bit bitmaps are handled. Paletted icons are a relic, and a
 * site that still ships one almost always also declares a PNG
 * `apple-touch-icon` that the fetcher tries first anyway.
 */
function dibToPng(data: Buffer): Buffer<ArrayBuffer> | null {
  if (data.length < 40) return null;

  const headerSize = data.readUInt32LE(0);
  if (headerSize < 40 || headerSize > data.length) return null;

  const width = data.readInt32LE(4);
  // An icon's DIB states twice its real height: the image, then its mask.
  const height = Math.floor(data.readInt32LE(8) / 2);
  const bitCount = data.readUInt16LE(14);
  const compression = data.readUInt32LE(16);

  if (width <= 0 || height <= 0 || width > MAX_SIDE || height > MAX_SIDE) return null;
  if (compression !== 0) return null;
  if (bitCount !== 32 && bitCount !== 24) return null;

  const bytesPerPixel = bitCount / 8;
  // Bitmap rows are padded to a four-byte boundary.
  const stride = Math.ceil((width * bytesPerPixel) / 4) * 4;
  const pixelStart = headerSize;
  if (pixelStart + stride * height > data.length) return null;

  // One filter byte per row, then RGBA.
  const raw = Buffer.alloc(height * (1 + width * 4));

  for (let y = 0; y < height; y += 1) {
    // DIB rows run bottom-up; PNG rows run top-down.
    const sourceRow = pixelStart + (height - 1 - y) * stride;
    const targetRow = y * (1 + width * 4);
    raw[targetRow] = 0; // filter: none

    for (let x = 0; x < width; x += 1) {
      const from = sourceRow + x * bytesPerPixel;
      const to = targetRow + 1 + x * 4;
      // Stored blue, green, red — alpha only when the depth carries one.
      raw[to] = data[from + 2]!;
      raw[to + 1] = data[from + 1]!;
      raw[to + 2] = data[from]!;
      raw[to + 3] = bitCount === 32 ? data[from + 3]! : 255;
    }
  }

  return encodePng(width, height, raw);
}

/* ---------------------------------------------------------------------- *
 * A minimal PNG writer.
 * ---------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Buffer): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer<ArrayBuffer> {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);

  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);

  return Buffer.concat([length, typed, crc]) as Buffer<ArrayBuffer>;
}

/** A zlib stream of stored (uncompressed) deflate blocks. */
function storedZlib(raw: Buffer): Buffer<ArrayBuffer> {
  const MAX_BLOCK = 65_535;
  const parts: Buffer[] = [Buffer.from([0x78, 0x01])];

  for (let offset = 0; offset < raw.length; offset += MAX_BLOCK) {
    const slice = raw.subarray(offset, Math.min(offset + MAX_BLOCK, raw.length));
    const last = offset + MAX_BLOCK >= raw.length ? 1 : 0;

    const head = Buffer.alloc(5);
    head[0] = last;
    head.writeUInt16LE(slice.length, 1);
    head.writeUInt16LE(~slice.length & 0xffff, 3);

    parts.push(head, slice);
  }

  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(adler32(raw), 0);
  parts.push(checksum);

  return Buffer.concat(parts) as Buffer<ArrayBuffer>;
}

function encodePng(width: number, height: number, raw: Buffer): Buffer<ArrayBuffer> {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlacing

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', storedZlib(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]) as Buffer<ArrayBuffer>;
}
