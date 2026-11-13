import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Reading a chapter page server-side, so somebody can paste a link without
 * installing anything.
 *
 * The rule that must never break: the server fetches the chapter's **HTML**
 * and nothing else. It returns page addresses, and the browser loads the
 * images itself. If this ever starts fetching images, Couchlist has become a
 * proxy for other people's comics — which its footer promises it is not. So
 * `fetch` is stubbed and every call recorded.
 *
 * Stubbing also keeps the private-address guard honest: pointing the test at
 * a local server would mean either weakening that check or skipping it, and
 * it is the one thing standing between this endpoint and the cloud metadata
 * service.
 */
const CHAPTER = 'https://example.com/manga/t/chapter-50';

const HTML = `<!doctype html><html><head><title>Ignore me</title></head><body>
  <header><img src="/logo.png" alt="Logo"></header>
  <h1>Chapter 50 — The Return</h1>
  <div class="reading-content">
    <img src="#" data-src="/pages/01.jpg">
    <img src="/pages/02.jpg" referrerpolicy="origin">
    <img src="/pages/03.jpg" referrerpolicy="no-referrer">
  </div>
  <select>
    <option value="/manga/t/chapter-49">Chapter 49</option>
    <option value="/manga/t/chapter-50">Chapter 50</option>
    <option value="/manga/t/chapter-51">Chapter 51</option>
  </select>
  <a href="/users/edward">Edward</a>
  <footer><img src="/ads/banner.jpg"></footer>
</body></html>`;

let asked: string[] = [];

function serve(body: string, init: { status?: number; type?: string } = {}) {
  asked = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    asked.push(String(input));
    const response = new Response(body, {
      status: init.status ?? 200,
      headers: { 'content-type': init.type ?? 'text/html; charset=utf-8' },
    });
    Object.defineProperty(response, 'url', { value: String(input) });
    return Promise.resolve(response);
  });
}

afterEach(() => vi.unstubAllGlobals());

async function read(url: string) {
  const { POST } = await import('../../apps/web/src/app/api/tools/chapter/route');
  const response = await POST(
    new Request('http://localhost/api/tools/chapter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('reading a chapter without the extension', () => {
  it('returns the pages, and fetches only the HTML', async () => {
    serve(HTML);
    const { status, body } = await read(CHAPTER);

    expect(status).toBe(200);
    const pages = body.pages as Array<{ url: string; referer: string }>;
    expect(pages.map((page) => page.url)).toEqual([
      'https://example.com/pages/01.jpg',
      'https://example.com/pages/02.jpg',
      'https://example.com/pages/03.jpg',
    ]);

    // One request, for the chapter page. No image was ever fetched here.
    expect(asked).toEqual([CHAPTER]);
  });

  it('carries each image referrer policy through', async () => {
    serve(HTML);
    const { body } = await read(CHAPTER);
    const pages = body.pages as Array<{ url: string; referer: string }>;

    expect(pages[0]!.referer).toBe(CHAPTER);
    expect(pages[1]!.referer).toBe('https://example.com/');
    expect(pages[2]!.referer).toBe('');
    // Any page naming a Referer may fail in the browser, so warn up front.
    expect(body.needsExtension).toBe(true);
  });

  it('returns a filtered chapter list rather than every link', async () => {
    serve(HTML);
    const { body } = await read(CHAPTER);
    const chapters = body.chapters as Array<{ label: string }>;
    expect(chapters.map((chapter) => chapter.label)).toEqual([
      'Chapter 49',
      'Chapter 50',
      'Chapter 51',
    ]);
  });

  it('refuses a private or non-public address without fetching it', async () => {
    for (const bad of [
      'http://localhost/x',
      'http://127.0.0.1/x',
      'http://169.254.169.254/latest/meta-data/',
      'http://192.168.0.1/x',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'nope',
    ]) {
      serve(HTML);
      const { status } = await read(bad);
      expect(status, bad).toBe(400);
      // Rejected before any request leaves the server.
      expect(asked, bad).toEqual([]);
    }
  });

  it('explains a refusal instead of failing blankly', async () => {
    serve('nope', { status: 403, type: 'text/plain' });
    const { status, body } = await read(CHAPTER);
    expect(status).toBe(502);
    expect(String((body.error as { message: string }).message)).toMatch(/refused|login/iu);
  });

  it('says so when a page has no images, rather than returning nothing', async () => {
    serve('<html><body><p>Read in our app!</p></body></html>');
    const { status, body } = await read(CHAPTER);
    expect(status).toBe(422);
    expect(String((body.error as { message: string }).message)).toMatch(/no page images/iu);
  });

  it('refuses something that is not an HTML page', async () => {
    serve('binary', { type: 'image/png' });
    const { status } = await read(CHAPTER);
    expect(status).toBe(422);
  });
});
