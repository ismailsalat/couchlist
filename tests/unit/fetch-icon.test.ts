import { describe, expect, it } from 'vitest';
import { fetchSiteIcon, type FetchLike } from '@couchlist/shared';

/**
 * Fetching an icon means asking a listed site for a file, which makes this a
 * request our server performs at an address somebody else controls. The tests
 * that matter are the ones about where it refuses to go.
 */

/** A one-pixel PNG, as real bytes, so the type sniffer sees a real header. */
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
    return {
      status: result.status,
      headers: { get: (name: string) => result.headers?.[name.toLowerCase()] ?? null },
      arrayBuffer: async () =>
        (result.body ?? Buffer.alloc(0)).buffer.slice(
          (result.body ?? Buffer.alloc(0)).byteOffset,
          (result.body ?? Buffer.alloc(0)).byteOffset + (result.body ?? Buffer.alloc(0)).byteLength,
        ) as ArrayBuffer,
    };
  };
  return { fetch, seen };
}

describe('fetching a site icon', () => {
  it('takes the first address that answers with a real image', async () => {
    const { fetch, seen } = responder((url) =>
      url.endsWith('/apple-touch-icon.png')
        ? { status: 200, body: PNG }
        : { status: 404 },
    );

    const result = await fetchSiteIcon('https://example.test/', fetch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mime).toBe('image/png');
      expect(result.from).toContain('/apple-touch-icon.png');
    }
    // It tried favicon.ico first and moved on rather than giving up.
    expect(seen[0]).toContain('/favicon.ico');
  });

  it('refuses a redirect into a private address', async () => {
    for (const target of [
      'http://127.0.0.1/icon.png',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/icon.png',
      'http://[::1]/icon.png',
      'http://localhost:8080/icon.png',
      'file:///etc/passwd',
    ]) {
      const { fetch, seen } = responder((url) =>
        url.includes('favicon.ico')
          ? { status: 302, headers: { location: target } }
          : { status: 404 },
      );

      const result = await fetchSiteIcon('https://example.test/', fetch);
      expect(result.ok, target).toBe(false);
      // Nothing but the original host was ever requested.
      for (const url of seen) expect(new URL(url).host, target).toBe('example.test');
    }
  });

  it('refuses a file that is not really an image', async () => {
    const { fetch } = responder(() => ({
      status: 200,
      body: Buffer.from('<!DOCTYPE html><html><body>404</body></html>'),
    }));

    const result = await fetchSiteIcon('https://example.test/', fetch);
    expect(result.ok).toBe(false);
  });

  it('refuses an SVG, the same as an upload would', async () => {
    const { fetch } = responder(() => ({
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
      body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
    }));

    expect((await fetchSiteIcon('https://example.test/', fetch)).ok).toBe(false);
  });

  it('gives up on a file that claims to be enormous without downloading it', async () => {
    const { fetch } = responder(() => ({
      status: 200,
      headers: { 'content-length': String(50 * 1024 * 1024) },
      body: PNG,
    }));

    expect((await fetchSiteIcon('https://example.test/', fetch)).ok).toBe(false);
  });

  it('stops following redirects rather than looping forever', async () => {
    const { fetch, seen } = responder(() => ({
      status: 302,
      headers: { location: 'https://example.test/round-and-round' },
    }));

    const result = await fetchSiteIcon('https://example.test/', fetch);
    expect(result.ok).toBe(false);
    // Four candidate paths, each allowed a bounded number of hops.
    expect(seen.length).toBeLessThan(25);
  });

  it('refuses an address that was never fetchable', async () => {
    const { fetch, seen } = responder(() => ({ status: 200, body: PNG }));
    const result = await fetchSiteIcon('javascript:alert(1)', fetch);

    expect(result.ok).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it('says something useful when the site simply has no icon', async () => {
    const { fetch } = responder(() => ({ status: 404 }));
    const result = await fetchSiteIcon('https://example.test/', fetch);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Upload one instead');
  });
});
