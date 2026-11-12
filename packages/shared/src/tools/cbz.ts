/**
 * Writing a .cbz, with no dependency.
 *
 * A .cbz *is* a ZIP of images in reading order — the format is a naming
 * convention, not a container of its own. So building one is writing a ZIP,
 * and that is a few hundred bytes of header per file.
 *
 * Everything is **stored**, not deflated. JPEG, PNG, WebP and AVIF are all
 * already compressed; running deflate over them costs seconds of a reader's
 * phone battery to save a fraction of a percent. Stored entries also mean no
 * compression library, which is the whole reason this fits in a page.
 *
 * Kept free of DOM and File APIs so the byte layout can be tested directly.
 */

/** One page, already encoded as image bytes. */
export interface ComicPage {
  /** Stored inside the archive. Readers sort by this, so it must sort right. */
  name: string;
  bytes: Uint8Array;
}

/* CRC-32, the one piece of arithmetic a ZIP cannot do without. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Pad a number for sorting.
 *
 * Comic readers sort entries as text, so `page2` lands after `page10`. Every
 * name gets the same width, which is the difference between a chapter that
 * reads in order and one that does not.
 */
export function pageName(index: number, total: number, extension: string): string {
  const width = Math.max(3, String(total).length);
  return `${String(index + 1).padStart(width, '0')}.${extension.replace(/^\./u, '').toLowerCase()}`;
}

/** The extension implied by an image's first bytes, or null. */
export function imageExtension(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'webp';
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'avif';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
  return null;
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}

/**
 * Build the archive.
 *
 * Local header, then bytes, for each entry; then a central directory
 * repeating the headers; then the end-of-central-directory record. That
 * ordering is what lets a reader list an archive without reading all of it.
 */
export function buildCbz(pages: readonly ComicPage[]): Uint8Array {
  /*
   * A ZIP with no entries is structurally valid — 22 bytes of end-record —
   * and `unzip` reads it as an empty archive. A comic with no pages is not a
   * comic, so this fails here rather than handing somebody a file their
   * reader opens to nothing.
   */
  if (pages.length === 0) throw new Error('A comic needs at least one page.');

  const duplicate = pages.find((page, index) => pages.findIndex((other) => other.name === page.name) !== index);
  if (duplicate) throw new Error(`Two pages are both called ${duplicate.name}.`);

  const encoder = new TextEncoder();

  const entries = pages.map((page) => {
    const name = encoder.encode(page.name);
    return { name, bytes: page.bytes, crc: crc32(page.bytes), offset: 0 };
  });

  const LOCAL_HEADER = 30;
  const CENTRAL_HEADER = 46;
  const END_RECORD = 22;

  let size = END_RECORD;
  for (const entry of entries) {
    size += LOCAL_HEADER + entry.name.length + entry.bytes.length;
    size += CENTRAL_HEADER + entry.name.length;
  }

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;

  for (const entry of entries) {
    entry.offset = at;

    writeUint32(view, at, 0x04034b50); // local file header
    writeUint16(view, at + 4, 20); // version needed
    writeUint16(view, at + 6, 0); // flags
    writeUint16(view, at + 8, 0); // method 0 = stored
    writeUint16(view, at + 10, 0); // modified time
    writeUint16(view, at + 12, 0x21); // modified date: 1 Jan 1996, a fixed value
    writeUint32(view, at + 14, entry.crc);
    writeUint32(view, at + 18, entry.bytes.length); // compressed size
    writeUint32(view, at + 22, entry.bytes.length); // uncompressed size
    writeUint16(view, at + 26, entry.name.length);
    writeUint16(view, at + 28, 0); // extra field length
    at += LOCAL_HEADER;

    out.set(entry.name, at);
    at += entry.name.length;
    out.set(entry.bytes, at);
    at += entry.bytes.length;
  }

  const directoryAt = at;

  for (const entry of entries) {
    writeUint32(view, at, 0x02014b50); // central directory header
    writeUint16(view, at + 4, 20); // version made by
    writeUint16(view, at + 6, 20); // version needed
    writeUint16(view, at + 8, 0);
    writeUint16(view, at + 10, 0);
    writeUint16(view, at + 12, 0);
    writeUint16(view, at + 14, 0x21);
    writeUint32(view, at + 16, entry.crc);
    writeUint32(view, at + 20, entry.bytes.length);
    writeUint32(view, at + 24, entry.bytes.length);
    writeUint16(view, at + 28, entry.name.length);
    writeUint16(view, at + 30, 0); // extra
    writeUint16(view, at + 32, 0); // comment
    writeUint16(view, at + 34, 0); // disk number
    writeUint16(view, at + 36, 0); // internal attributes
    writeUint32(view, at + 38, 0); // external attributes
    writeUint32(view, at + 42, entry.offset);
    at += CENTRAL_HEADER;

    out.set(entry.name, at);
    at += entry.name.length;
  }

  writeUint32(view, at, 0x06054b50); // end of central directory
  writeUint16(view, at + 4, 0);
  writeUint16(view, at + 6, 0);
  writeUint16(view, at + 8, entries.length);
  writeUint16(view, at + 10, entries.length);
  writeUint32(view, at + 12, at - directoryAt);
  writeUint32(view, at + 16, directoryAt);
  writeUint16(view, at + 20, 0); // comment length

  return out;
}

/**
 * Where to cut a long strip.
 *
 * Webtoons arrive as one image thousands of pixels tall, which readers and
 * e-ink devices handle badly. Cutting on a fixed interval would slice through
 * a panel or a speech bubble, so the caller supplies the rows it believes are
 * gutters — long runs of near-uniform colour — and this picks the gutter
 * nearest each ideal boundary.
 *
 * Returns the y positions to cut at, never including 0 or the full height.
 */
export function chooseCuts(height: number, target: number, gutters: readonly number[]): number[] {
  if (height <= target) return [];

  const cuts: number[] = [];
  // How far from the ideal we will wander to land on a gutter.
  const tolerance = Math.round(target * 0.35);
  let previous = 0;

  while (previous + target < height) {
    const ideal = previous + target;

    let best: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const gutter of gutters) {
      if (gutter <= previous + target * 0.4) continue;
      const distance = Math.abs(gutter - ideal);
      if (distance < bestDistance && distance <= tolerance) {
        best = gutter;
        bestDistance = distance;
      }
    }

    const cut = best ?? ideal;
    // Never produce a sliver at the end: fold the remainder into this page.
    if (height - cut < target * 0.35) break;
    cuts.push(cut);
    previous = cut;
  }

  return cuts;
}

/* ------------------------------------------------------------------ reading */

/**
 * Reading an archive back.
 *
 * Writing one needed no compression; reading one does, because almost every
 * .cbz in the wild was made by a tool that deflated the entries. The browser
 * can inflate natively through `DecompressionStream('deflate-raw')`, so this
 * still needs no library — which matters when the alternative is shipping a
 * compression library to every phone that opens the reader.
 *
 * The central directory is parsed rather than the local headers, because an
 * entry written with a streaming writer leaves its sizes as zero in the local
 * header and fills them in afterwards. The directory is the authority.
 */

export interface ArchiveEntry {
  name: string;
  /** Offset of the local header, where the bytes begin. */
  offset: number;
  compressedSize: number;
  uncompressedSize: number;
  /** 0 stored, 8 deflated. Anything else we cannot read. */
  method: number;
}

const SIGNATURE_END = 0x06054b50;
const SIGNATURE_CENTRAL = 0x02014b50;

/**
 * Find the end-of-central-directory record.
 *
 * It sits at the very end unless the archive has a comment, so this scans
 * backwards over the largest comment a zip can hold.
 */
function findEndRecord(view: DataView): number | null {
  const start = Math.max(0, view.byteLength - 65_557);
  for (let at = view.byteLength - 22; at >= start; at -= 1) {
    if (view.getUint32(at, true) === SIGNATURE_END) return at;
  }
  return null;
}

/** List what is inside, without reading any of it. */
export function readArchiveIndex(bytes: Uint8Array): ArchiveEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndRecord(view);
  if (end === null) throw new Error('That does not look like a .cbz or .zip file.');

  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);

  const decoder = new TextDecoder();
  const entries: ArchiveEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== SIGNATURE_CENTRAL) break;

    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const uncompressedSize = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);

    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;

    // Directory markers and the junk some archivers add are not pages.
    if (name.endsWith('/') || name.startsWith('__MACOSX/') || name.split('/').pop()?.startsWith('.')) {
      continue;
    }
    entries.push({ name, offset, compressedSize, uncompressedSize, method });
  }

  return entries;
}

/** Where an entry's bytes actually start, after its local header. */
export function entryDataOffset(bytes: Uint8Array, entry: ArchiveEntry): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLength = view.getUint16(entry.offset + 26, true);
  const extraLength = view.getUint16(entry.offset + 28, true);
  return entry.offset + 30 + nameLength + extraLength;
}

/**
 * Pull one entry out.
 *
 * Takes an inflate function so this file stays free of platform APIs: the
 * browser passes one built on DecompressionStream, and a test passes zlib.
 */
export async function readArchiveEntry(
  bytes: Uint8Array,
  entry: ArchiveEntry,
  inflateRaw: (input: Uint8Array) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const start = entryDataOffset(bytes, entry);
  const slice = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return slice;
  if (entry.method === 8) return inflateRaw(slice);
  throw new Error(`${entry.name} uses a compression method we cannot read.`);
}

/** Only the entries that are images, in reading order. */
export function imageEntries(entries: readonly ArchiveEntry[]): ArchiveEntry[] {
  const pictures = entries.filter((entry) => /\.(jpe?g|png|webp|avif|gif|bmp)$/iu.test(entry.name));
  // Numeric collation, so page2 comes before page10 whatever the archiver did.
  return pictures.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
