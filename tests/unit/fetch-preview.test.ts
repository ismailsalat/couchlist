import { describe, expect, it } from 'vitest';
import {
  fetchSitePreview,
  looksLikeAPage,
  readShareImage,
  type FetchLike,
} from '@couchlist/shared';

/**
 * A preview is the picture a site publishes about itself, not a screenshot
 * somebody took of it. These tests pin both halves of that: that the right
 * tag is read, and that reading it never becomes a way to make our server
 * fetch an address a listed site chose on our own network.
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** A PNG shaped like a picture of a page, rather than a logo. */
function pageShapedPng(width = 1200, height = 630): Buffer {
  const bytes = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function responder(
  handler: (url: string) => { status: number; headers?: Record<string, string>; body?: Buffer },
): { fetch: FetchLike; seen: string[] } {
  const seen: string[] = [];
  const fetch: FetchLike = async (url) => {
    seen.push(url);
    const result = handler(url);
    const body = result.body ?? Buffer.alloc(0);
    return {
      status: result.status,
      headers: { get: (name: string) => result.headers?.[name.toLowerCase()] ?? null },
      arrayBuffer: async () =>
        body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
    };
  };
  return { fetch, seen };
}

describe('reading a site\'s published share image', () => {
  const page = new URL('https://example.test/');

  it('finds an og:image however the attributes are ordered', () => {
    expect(
      readShareImage('<meta property="og:image" content="https://cdn.test/a.png">', page),
    ).toBe('https://cdn.test/a.png');
    expect(
      readShareImage('<meta content="https://cdn.test/b.png" property="og:image">', page),
    ).toBe('https://cdn.test/b.png');
  });

  it('resolves a relative path against the page', () => {
    expect(readShareImage('<meta property="og:image" content="/share.png">', page)).toBe(
      'https://example.test/share.png',
    );
  });

  it('falls back to a twitter card', () => {
    expect(
      readShareImage('<meta name="twitter:image" content="https://cdn.test/t.png">', page),
    ).toBe('https://cdn.test/t.png');
  });

  it('returns nothing when the site publishes none', () => {
    expect(readShareImage('<html><head><title>No tags</title></head></html>', page)).toBeNull();
  });
});

describe('fetching a site preview', () => {
  it('fetches the picture the site points at', async () => {
    const { fetch } = responder((url) =>
      url.endsWith('/share.png')
        ? { status: 200, body: pageShapedPng() }
        : {
            status: 200,
            body: Buffer.from('<meta property="og:image" content="/share.png">'),
          },
    );

    const result = await fetchSitePreview('https://example.test/', fetch);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mime).toBe('image/png');
  });

  it('refuses a share image pointed at a private address', async () => {
    for (const target of [
      'http://127.0.0.1/secret.png',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/x.png',
      'file:///etc/passwd',
    ]) {
      const { fetch, seen } = responder(() => ({
        status: 200,
        body: Buffer.from(`<meta property="og:image" content="${target}">`),
      }));

      const result = await fetchSitePreview('https://example.test/', fetch);
      expect(result.ok, target).toBe(false);
      for (const url of seen) expect(new URL(url).host, target).toBe('example.test');
    }
  });

  it('refuses a redirect out of the share image into a private address', async () => {
    const { fetch, seen } = responder((url) =>
      url.endsWith('/share.png')
        ? { status: 302, headers: { location: 'http://10.0.0.5/x.png' } }
        : { status: 200, body: Buffer.from('<meta property="og:image" content="/share.png">') },
    );

    expect((await fetchSitePreview('https://example.test/', fetch)).ok).toBe(false);
    for (const url of seen) expect(new URL(url).host).toBe('example.test');
  });

  it('refuses a share image that is not really an image', async () => {
    const { fetch } = responder((url) =>
      url.endsWith('/share.png')
        ? { status: 200, body: Buffer.from('<html>not an image</html>') }
        : { status: 200, body: Buffer.from('<meta property="og:image" content="/share.png">') },
    );

    expect((await fetchSitePreview('https://example.test/', fetch)).ok).toBe(false);
  });

  it('says plainly when a site publishes nothing to show', async () => {
    const { fetch } = responder(() => ({
      status: 200,
      body: Buffer.from('<html><head></head><body>hello</body></html>'),
    }));

    const result = await fetchSitePreview('https://example.test/', fetch);
    expect(result.ok).toBe(false);
    // It now names the better next step first: a screenshot works on a site
    // that publishes nothing, where an upload means going and making one.
    if (!result.ok) expect(result.message).toContain('screenshot or upload one instead');
  });
});

describe('telling a page apart from a logo', () => {
  /**
   * A PNG of the stated size: real signature, real IHDR layout.
   *
   * It has to be a genuine-looking PNG, not just something with the size in
   * the right place, because the type check that runs first reads the leading
   * bytes and would otherwise reject it before the shape is ever considered.
   */
  function png(width: number, height: number): Buffer {
    const bytes = Buffer.alloc(64);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
    bytes.writeUInt32BE(13, 8);
    bytes.write('IHDR', 12, 'ascii');
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    return bytes;
  }

  it('accepts the shape a share image of a page actually has', () => {
    for (const [width, height] of [
      [1200, 630],
      [1280, 720],
      [800, 418],
    ]) {
      expect(looksLikeAPage(png(width, height)).ok, `${width}x${height}`).toBe(true);
    }
  });

  it('refuses a square logo, which is what sites most often publish', () => {
    for (const [width, height] of [
      [512, 512],
      [1024, 1024],
      [200, 200],
    ]) {
      const verdict = looksLikeAPage(png(width, height));
      expect(verdict.ok, `${width}x${height}`).toBe(false);
    }
  });

  it('refuses anything too small to show a page at all', () => {
    const verdict = looksLikeAPage(png(300, 160));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.why).toContain('logo');
  });

  it('refuses a tall image, which is never a view of a page', () => {
    expect(looksLikeAPage(png(600, 900)).ok).toBe(false);
  });

  it('lets through an image it cannot measure, rather than guessing', () => {
    // The type check has already proved it is a real image of an accepted
    // format; refusing on top of that would be refusing for no reason.
    expect(looksLikeAPage(Buffer.alloc(40)).ok).toBe(true);
  });

  it('explains itself when a site publishes its logo', async () => {
    const logo = Buffer.concat([png(512, 512), Buffer.alloc(200)]);
    const { fetch } = responder((url) =>
      url.endsWith('/logo.png')
        ? { status: 200, body: logo }
        : { status: 200, body: Buffer.from('<meta property="og:image" content="/logo.png">') },
    );

    const result = await fetchSitePreview('https://example.test/', fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('512×512');
      expect(result.message).toContain('Take a screenshot');
    }
  });
});

describe('working with a page that is bigger than the cap', () => {
  const PNG_WIDE = (() => {
    // A 640x360 PNG header is enough: only the size is read from it.
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    bytes.writeUInt32BE(640, 16);
    bytes.writeUInt32BE(360, 20);
    return bytes;
  })();

  it('reads the head of a page far too large to hold in full', async () => {
    // Real homepages run past half a megabyte; this used to refuse them
    // outright, which is why previews failed on exactly the biggest sites.
    const padding = '<!-- '.padEnd(900_000, 'x') + ' -->';
    const html = `<meta property="og:image" content="/share.png">${padding}`;

    const { fetch } = responder((url) =>
      url.endsWith('/share.png')
        ? { status: 200, body: PNG_WIDE }
        : { status: 200, body: Buffer.from(html) },
    );

    const result = await fetchSitePreview('https://example.test/', fetch);
    expect(result.ok).toBe(true);
  });

  it('moves on to the next picture when the first is a logo', async () => {
    const square = Buffer.from(PNG_WIDE);
    square.writeUInt32BE(200, 16);
    square.writeUInt32BE(200, 20);

    const { fetch } = responder((url) => {
      if (url.endsWith('/logo.png')) return { status: 200, body: square };
      if (url.endsWith('/card.png')) return { status: 200, body: PNG_WIDE };
      return {
        status: 200,
        body: Buffer.from(
          '<meta property="og:image" content="/logo.png">' +
            '<meta name="twitter:image" content="/card.png">',
        ),
      };
    });

    const result = await fetchSitePreview('https://example.test/', fetch);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.from).toContain('/card.png');
  });

  it('says it is a logo when every picture the site offers is one', async () => {
    const square = Buffer.from(PNG_WIDE);
    square.writeUInt32BE(200, 16);
    square.writeUInt32BE(200, 20);

    const { fetch } = responder((url) =>
      url.endsWith('/logo.png')
        ? { status: 200, body: square }
        : { status: 200, body: Buffer.from('<meta property="og:image" content="/logo.png">') },
    );

    const result = await fetchSitePreview('https://example.test/', fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('logo');
      expect(result.message).toContain('screenshot');
    }
  });
});
