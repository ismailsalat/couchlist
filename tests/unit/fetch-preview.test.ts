import { describe, expect, it } from 'vitest';
import { fetchSitePreview, readShareImage, type FetchLike } from '@couchlist/shared';

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
        ? { status: 200, body: PNG }
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
    if (!result.ok) expect(result.message).toContain('Upload one instead');
  });
});
