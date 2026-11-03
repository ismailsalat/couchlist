/**
 * The size of an image, read from its own header.
 *
 * No decoding and no dependency: every format here puts width and height in
 * the first few dozen bytes, which is all that is needed to answer "is this a
 * picture of a page, or is it a logo".
 */

export interface ImageSize {
  width: number;
  height: number;
}

/** PNG: an IHDR chunk at a fixed offset. */
function pngSize(bytes: Buffer): ImageSize | null {
  if (bytes.length < 24) return null;
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * JPEG: walk the markers to the start-of-frame, which carries the size.
 *
 * The frame is not at a fixed offset because a file may begin with any number
 * of metadata segments, so the segment lengths have to be followed.
 */
function jpegSize(bytes: Buffer): ImageSize | null {
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1]!;
    // Start-of-frame markers, excluding the two that are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }

    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }

  return null;
}

/** WebP: three container flavours, each storing the size differently. */
function webpSize(bytes: Buffer): ImageSize | null {
  if (bytes.length < 30) return null;
  const format = bytes.toString('ascii', 12, 16);

  if (format === 'VP8 ') {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (format === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === 'VP8X') {
    const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    return { width, height };
  }

  return null;
}

/** The image's own idea of its size, or null when it does not say. */
export function readImageSize(bytes: Buffer): ImageSize | null {
  if (bytes.length < 16) return null;

  if (bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') return pngSize(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes);
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return webpSize(bytes);
  }

  return null;
}
