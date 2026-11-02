import { describe, expect, it } from 'vitest';
import {
  ICON_MAX_BYTES,
  checkIconUpload,
  iconResponseHeaders,
  sniffImageMime,
} from '@couchlist/shared';

/**
 * An uploaded icon is a file from a stranger. These tests pin the two things
 * that keep it from becoming an attack: the type is decided by the file's own
 * bytes rather than by anything the browser claims, and SVG never gets in.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 7)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x20, 0, 0, 0]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(16, 3),
]);
const GIF = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(20, 1)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>');

const b64 = (buffer: Buffer) => buffer.toString('base64');
const dataUrl = (buffer: Buffer, mime: string) => `data:${mime};base64,${b64(buffer)}`;

describe('icon type sniffing', () => {
  it('reads PNG, JPEG and WebP from their leading bytes', () => {
    expect(sniffImageMime(PNG)).toBe('image/png');
    expect(sniffImageMime(JPEG)).toBe('image/jpeg');
    expect(sniffImageMime(WEBP)).toBe('image/webp');
  });

  it('does not recognise a format it will not serve', () => {
    expect(sniffImageMime(GIF)).toBeNull();
    expect(sniffImageMime(SVG)).toBeNull();
  });

  it('does not read past the end of a very short file', () => {
    expect(sniffImageMime(Buffer.from([0x89, 0x50]))).toBeNull();
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('icon upload validation', () => {
  it('accepts a PNG as a bare base64 string', () => {
    const result = checkIconUpload(b64(PNG));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mime).toBe('image/png');
      expect(result.byteSize).toBe(PNG.length);
      expect(result.bytes.equals(PNG)).toBe(true);
    }
  });

  it('accepts the data URL a browser FileReader produces', () => {
    const result = checkIconUpload(dataUrl(WEBP, 'image/webp'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mime).toBe('image/webp');
  });

  it('believes the bytes, not the data URL label', () => {
    // A JPEG announced as a PNG is still stored and served as a JPEG.
    const result = checkIconUpload(dataUrl(JPEG, 'image/png'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mime).toBe('image/jpeg');
  });

  it('refuses an SVG however it is labelled', () => {
    for (const labelled of [b64(SVG), dataUrl(SVG, 'image/svg+xml'), dataUrl(SVG, 'image/png')]) {
      const result = checkIconUpload(labelled);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('malformed');
    }
  });

  it('refuses a GIF, which is not one of the three it serves', () => {
    const result = checkIconUpload(b64(GIF));
    expect(result.ok).toBe(false);
  });

  it('refuses a data URL that is not base64 at all', () => {
    const result = checkIconUpload('data:image/svg+xml,%3Csvg%3E%3C/svg%3E');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsupported_type');
  });

  it('refuses anything that is not a non-empty string', () => {
    for (const input of [null, undefined, 42, {}, [], '', '   ']) {
      const result = checkIconUpload(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('empty');
    }
  });

  it('refuses a file over the cap, and bounds the work before decoding', () => {
    const tooBig = Buffer.concat([PNG, Buffer.alloc(ICON_MAX_BYTES + 1024, 9)]);
    const result = checkIconUpload(b64(tooBig));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too_large');
  });

  it('accepts a file exactly at the cap', () => {
    const exact = Buffer.concat([PNG, Buffer.alloc(ICON_MAX_BYTES - PNG.length, 9)]);
    expect(exact.length).toBe(ICON_MAX_BYTES);
    const result = checkIconUpload(b64(exact));
    expect(result.ok).toBe(true);
  });

  it('refuses a string that is not base64', () => {
    const result = checkIconUpload('not base64 at all!!!');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('never returns a message that echoes the upload back', () => {
    const result = checkIconUpload('<script>alert(1)</script>');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain('script');
  });
});

describe('icon response headers', () => {
  it('serves the validated type and forbids sniffing', () => {
    const headers = iconResponseHeaders('image/png', true);
    expect(headers['content-type']).toBe('image/png');
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  it('serves under a policy that can neither execute nor fetch', () => {
    const csp = iconResponseHeaders('image/png', true)['content-security-policy']!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('sandbox');
  });

  it('keeps an unapproved icon out of shared caches', () => {
    expect(iconResponseHeaders('image/png', false)['cache-control']).toContain('no-store');
    expect(iconResponseHeaders('image/png', true)['cache-control']).toContain('public');
  });
});
