import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The extension's one indispensable job: fetching a page image that the
 * source will not serve to us directly.
 *
 * Nearly every manga CDN refuses a request whose Referer is not its own site.
 * An `<img>` on couchlist.io therefore gets a 403 and the reader shows a
 * column of broken pages — which is exactly what shipped once, because this
 * relay was left out as unnecessary complexity. It is not complexity; it is
 * the feature.
 *
 * So this runs the real extension in a real browser against a server that
 * behaves like those CDNs. A unit test cannot cover it: the whole mechanism
 * is Chrome's, and the thing worth proving is that Chrome actually applies
 * the header rule.
 */
// Playwright runs from the repository root.
const root = process.cwd();
const PORT = 8899;

let cdn: Server;
let context: BrowserContext;
let hits: Array<string | undefined> = [];

test.beforeAll(async () => {
  const png = readFileSync(path.join(root, 'tests/fixtures/page.png'));

  cdn = createServer((request, response) => {
    const referer = request.headers.referer;
    hits.push(referer);
    if (!referer?.startsWith('http://source.local')) {
      response.writeHead(403, { 'content-type': 'text/plain' });
      response.end('Forbidden');
      return;
    }
    response.writeHead(200, { 'content-type': 'image/png' });
    response.end(png);
  });
  await new Promise<void>((resolve) => cdn.listen(PORT, resolve));

  // A copy of the real extension with host access pre-granted: Chrome's
  // permission dialog cannot be clicked from a test, and it is Chrome's own
  // flow rather than ours. Everything else is the shipped code.
  const dir = mkdtempSync(path.join(tmpdir(), 'cl-ext-'));
  cpSync(path.join(root, 'extension'), dir, { recursive: true });
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    host_permissions?: string[];
    content_scripts: Array<{ matches: string[] }>;
  };
  manifest.host_permissions = ['http://127.0.0.1/*', 'http://localhost/*'];
  manifest.content_scripts[0]!.matches.push('http://127.0.0.1/tools/*');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'cl-prof-')), {
    // Old headless Chromium does not load extensions at all.
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${dir}`,
      `--load-extension=${dir}`,
      '--no-sandbox',
    ],
  });
});

test.afterAll(async () => {
  await context?.close();
  await new Promise<void>((resolve) => cdn?.close(() => resolve()));
});

/** Speak to the extension exactly the way the reader does. */
async function askExtension(page: import('@playwright/test').Page, request: Record<string, unknown>) {
  return page.evaluate(async (req) => {
    const TAG = 'couchlist-reader-extension';
    return new Promise<Record<string, unknown>>((resolve) => {
      const id = `t${Math.random()}`;
      const finish = (reply: Record<string, unknown>) => {
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        resolve(reply);
      };
      const onMessage = (event: MessageEvent) => {
        const data = event.data as Record<string, unknown> | null;
        if (event.source !== window || event.origin !== location.origin) return;
        if (data?.tag === TAG && data.id === id && data.reply) finish(data);
      };
      const timer = setTimeout(() => finish({ ok: false, error: 'no answer' }), 20_000);
      window.addEventListener('message', onMessage);
      window.postMessage({ tag: TAG, id, ...req }, location.origin);
    });
  }, request);
}

test.describe('reader extension', () => {
  test('announces itself to the reader page', async () => {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3000/tools/comics');
    const reply = await askExtension(page, { type: 'ping' });
    expect(reply.ok).toBe(true);
    await page.close();
  });

  test('fetches a page the source refuses to serve us directly', async () => {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3000/tools/comics');

    // Proof the server really does block us: the browser's own fetch fails.
    const direct = await page.evaluate(async () => {
      const response = await fetch('http://127.0.0.1:8899/page-01.png').catch(() => null);
      return response?.status ?? 0;
    });
    expect(direct).not.toBe(200);

    hits = [];
    const reply = await askExtension(page, {
      type: 'page',
      url: 'http://127.0.0.1:8899/page-01.png',
      referer: 'http://source.local/ch/1',
    });

    expect(reply.ok, String(reply.error)).toBe(true);
    expect(String(reply.dataUrl)).toMatch(/^data:image\/png;base64,/u);
    // The header rule is what makes this work, so assert it was applied.
    expect(hits.some((referer) => referer?.startsWith('http://source.local'))).toBe(true);
    await page.close();
  });

  test('explains a refusal instead of returning a broken page', async () => {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3000/tools/comics');

    const reply = await askExtension(page, {
      type: 'page',
      url: 'http://127.0.0.1:8899/page-01.png',
      referer: 'http://wrong.local/ch/1',
    });

    expect(reply.ok).toBe(false);
    // The reader shows this wording, so it has to say something actionable.
    expect(String(reply.error)).toMatch(/refused|403/iu);
    await page.close();
  });
});
