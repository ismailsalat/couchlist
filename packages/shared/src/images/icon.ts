/**
 * Site-icon validation.
 *
 * An uploaded icon is a file from a stranger, so nothing here trusts what the
 * browser claims about it:
 *
 *  - The type is read from the file's own magic bytes, never from the
 *    `Content-Type` header or the filename. A `.png` that is really something
 *    else is rejected.
 *  - SVG is never accepted. It is a document format that can carry script, and
 *    serving one from the site's own origin would be a cross-site scripting
 *    hole dressed up as an icon.
 *  - The size cap is enforced on the decoded bytes, before anything is stored.
 *
 * The file is stored and served as-is; it is never parsed, resized or
 * re-encoded, so no image library is exposed to hostile input.
 */

export const ICON_MAX_BYTES = 262_144; // 256 KiB
export const ICON_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type IconMime = (typeof ICON_MIME_TYPES)[number];

export type IconRejection =
  | 'empty'
  | 'too_large'
  | 'unsupported_type'
  | 'malformed';

export type IconCheck =
  | { ok: true; mime: IconMime; bytes: Buffer; byteSize: number }
  | { ok: false; reason: IconRejection; message: string };

const REJECTION_MESSAGES: Record<IconRejection, string> = {
  empty: 'That file is empty.',
  too_large: `Icons must be ${Math.floor(ICON_MAX_BYTES / 1024)} KB or smaller.`,
  unsupported_type: 'Use a PNG, JPEG or WebP image. SVG files are not accepted.',
  malformed: 'That file does not look like a PNG, JPEG or WebP image.',
};

function reject(reason: IconRejection): IconCheck {
  return { ok: false, reason, message: REJECTION_MESSAGES[reason] };
}

/** Reads the real format from the leading bytes. Null when unrecognised. */
export function sniffImageMime(bytes: Buffer): IconMime | null {
  if (bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Validates a base64-encoded icon from a request body.
 *
 * Accepts either a bare base64 string or a `data:` URL, because both are what
 * a browser's FileReader produces.
 */
export function checkIconUpload(input: unknown): IconCheck {
  if (typeof input !== 'string' || input.trim() === '') return reject('empty');

  let encoded = input.trim();
  const dataUrl = /^data:([a-z0-9/+.-]+);base64,/i.exec(encoded);
  if (dataUrl) {
    encoded = encoded.slice(dataUrl[0].length);
  } else if (encoded.startsWith('data:')) {
    // A data URL that is not base64, so there is nothing safe to decode.
    return reject('unsupported_type');
  }

  // Reject before decoding: base64 inflates by about a third, so this bounds
  // the work done on a hostile payload.
  if (encoded.length > Math.ceil((ICON_MAX_BYTES * 4) / 3) + 1024) {
    return reject('too_large');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded.replace(/\s+/g, ''))) {
    return reject('malformed');
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(encoded, 'base64');
  } catch {
    return reject('malformed');
  }

  if (bytes.length === 0) return reject('empty');
  if (bytes.length > ICON_MAX_BYTES) return reject('too_large');

  const mime = sniffImageMime(bytes);
  if (!mime) return reject('malformed');

  return { ok: true, mime, bytes, byteSize: bytes.length };
}

/** Response headers for serving a stored icon. */
export function iconResponseHeaders(mime: string, immutable: boolean): Record<string, string> {
  return {
    'content-type': mime,
    // The browser must not second-guess the type we validated.
    'x-content-type-options': 'nosniff',
    // Belt and braces: even if something unexpected were stored, it cannot
    // execute or embed anything when served under this policy.
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'cache-control': immutable
      ? 'public, max-age=86400, stale-while-revalidate=604800'
      : 'private, no-store',
  };
}
