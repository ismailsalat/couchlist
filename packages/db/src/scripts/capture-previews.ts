import { chromium, type Browser } from 'playwright-core';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { checkIconUpload, createLogger, parseExternalUrl, PREVIEW_MAX_BYTES } from '@couchlist/shared';
import { closeDatabase, getDatabase } from '../client.js';
import { loadProjectEnv } from '../load-env.js';
import { IconRepository } from '../repositories/icons.js';

/**
 * Photographs the listed sites, for a moderator to look at.
 *
 *   npm run capture:previews              # a few listings that have none
 *   npm run capture:previews -- --limit 5
 *   npm run capture:previews -- --source wsr_abc123
 *
 * Three rules, and they are the reason this is a separate job rather than a
 * button on a page:
 *
 *  1. **Nothing it captures is published.** A bot pointed at somebody else's
 *     homepage will eventually photograph an advert, an age gate, or a page
 *     that changed hands overnight. Every capture lands unapproved and waits
 *     on `/admin/previews`, so the first person to see it is a moderator
 *     rather than a reader.
 *
 *  2. **It never runs inside the web app.** A browser is hundreds of
 *     megabytes of memory and several seconds per page; doing that in a
 *     request would take the site down under the first bit of load.
 *
 *  3. **It is off unless somebody schedules it and installs a browser.** With
 *     no Chromium present it says so, in one line, and exits without an
 *     error — a deployment that never wants this should not look broken.
 *
 * The page is loaded with JavaScript enabled, because a modern site renders
 * nothing without it, but with no cookies kept, no storage, no downloads and
 * a short timeout. Nothing from the page survives the capture except an image.
 */

const DEFAULT_LIMIT = 10;
const VIEWPORT = { width: 1280, height: 800 };
const TIMEOUT_MS = 20_000;

/**
 * Where to find a browser.
 *
 * Deliberately not a bundled download: on a host, Chromium comes from the
 * system package set, and an env var covers anywhere unusual. Returns null
 * when there is no browser, which is a normal state rather than a failure.
 */
function findBrowser(): string | null {
  const configured = process.env.CHROMIUM_PATH?.trim();
  if (configured) return existsSync(configured) ? configured : null;

  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
  ];
  const known = candidates.find((path) => existsSync(path));
  if (known) return known;

  /*
   * Nix puts binaries on PATH rather than in /usr/bin, and the store path
   * changes with every rebuild, so it cannot be written down. Ask the shell
   * where the browser is instead of guessing.
   */
  for (const name of ['chromium', 'chromium-browser', 'google-chrome']) {
    try {
      const found = execFileSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
      if (found && existsSync(found)) return found;
    } catch {
      // Not on PATH either. Try the next name.
    }
  }

  return null;
}

async function capture(
  browser: Browser,
  homepageUrl: string,
): Promise<{ bytes: Buffer; from: string } | null> {
  const target = parseExternalUrl(homepageUrl);
  if (!target) return null;

  const context = await browser.newContext({
    viewport: VIEWPORT,
    // An honest identity. A site that would rather not be photographed can
    // say so, and blocking this agent is a perfectly good way to do it.
    userAgent:
      'CouchlistPreview/1.0 (+one screenshot of the homepage, for a directory listing)',
    acceptDownloads: false,
    javaScriptEnabled: true,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);

    const response = await page.goto(target.url.toString(), {
      // 'load' rather than 'domcontentloaded': a screenshot taken before the
      // stylesheets arrive is a picture of unstyled HTML, which is worse than
      // no picture at all. Not 'networkidle', which never arrives on a page
      // with an advert carousel on it.
      waitUntil: 'load',
      timeout: TIMEOUT_MS,
    });
    if (!response || response.status() >= 400) return null;

    // Wherever the page ended up, it must still be an address we would have
    // been willing to fetch: a redirect is the site choosing our destination.
    const landed = parseExternalUrl(page.url());
    if (!landed) return null;

    // Web fonts land after 'load' and move every line of text when they do.
    // Written as source rather than a closure: this package compiles without
    // DOM types, because everything else in it runs on the server.
    await page.evaluate('document.fonts && document.fonts.ready').catch(() => undefined);
    await page.waitForTimeout(1_500);

    /*
     * Is there actually a page here?
     *
     * A capture of an empty body, a bare error or a blocked-request page is
     * worse than no capture: it fills a moderator's queue with pictures of
     * nothing, and the queue stops being read. A page with almost no text is
     * not one worth photographing.
     */
    const looksRendered = await page
      .evaluate<boolean>('((document.body && document.body.innerText) || "").trim().length >= 60')
      .catch(() => false);
    if (!looksRendered) return null;

    const bytes = await page.screenshot({ type: 'jpeg', quality: 72, fullPage: false });
    return { bytes: Buffer.from(bytes), from: landed.url.toString() };
  } catch {
    return null;
  } finally {
    await context.close();
  }
}

/**
 * One pass of the capture job, callable.
 *
 * Exported so the combined maintenance run reuses it rather than keeping a
 * second copy of the rules about what gets photographed and what happens to
 * the result.
 */
export async function runPreviewCapture(
  options: { limit?: number; only?: string } = {},
): Promise<void> {
  const logger = createLogger({ service: 'previews' });
  const { only } = options;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const executablePath = findBrowser();
  if (!executablePath) {
    logger.info('no_browser_installed', {
      note: 'Screenshots are off. Install Chromium and set CHROMIUM_PATH to turn them on.',
    });
    return;
  }

  const db = getDatabase();
  const icons = new IconRepository(db);

  const targets = only
    ? (await icons.sourcesWithoutPreview(1000)).filter((row) => row.id === only)
    : await icons.sourcesWithoutPreview(limit);

  if (targets.length === 0) {
    logger.info('nothing_to_capture');
    return;
  }

  logger.info('capturing', { count: targets.length });
  // Some hosts only reach the web through a proxy, and a browser does not
  // read the environment the way a fetch does.
  const proxyServer = process.env.HTTPS_PROXY ?? process.env.https_proxy;

  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
  });

  let captured = 0;
  let skipped = 0;

  try {
    // One at a time. Several browsers at once is the quickest way to be
    // killed by a host's memory limit, and there is no hurry here.
    for (const source of targets) {
      const shot = await capture(browser, source.homepageUrl);
      if (!shot) {
        skipped += 1;
        logger.warn('capture_failed', { domain: source.domain });
        continue;
      }

      // The same gate every uploaded image passes, including reading the real
      // type from the leading bytes.
      const check = checkIconUpload(shot.bytes.toString('base64'), PREVIEW_MAX_BYTES);
      if (!check.ok) {
        skipped += 1;
        logger.warn('capture_rejected', { domain: source.domain, reason: check.message });
        continue;
      }

      await icons.setSourcePreview(
        source.id,
        { mime: check.mime, bytes: check.bytes, byteSize: check.byteSize },
        null,
        'Screenshot of the site, taken automatically',
        { approved: false, capturedFrom: shot.from },
      );
      captured += 1;
      logger.info('captured', { domain: source.domain, bytes: check.byteSize });
    }
  } finally {
    await browser.close();
  }

  logger.info('finished', {
    captured,
    skipped,
    note: captured > 0 ? 'Waiting for review at /admin/previews' : undefined,
  });
}

/*
 * Close the pool, then exit, whatever happened.
 *
 * A scheduled job that does not terminate is worse than one that fails: the
 * host sees the previous run still going and skips the next one, so a job
 * that leaves a database connection open runs exactly once and then appears
 * to have been forgotten about.
 */
/** The command-line entry point. */
async function main(): Promise<void> {
  loadProjectEnv();
  const args = process.argv.slice(2);
  const limitArg = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : undefined;

  await runPreviewCapture({
    only: args.includes('--source') ? args[args.indexOf('--source') + 1] : undefined,
    limit: Number.isFinite(limitArg) && limitArg! > 0 ? Number(limitArg) : undefined,
  });
}

// Run only when this file is the program, not when the maintenance job
// imports it for the function above.
if (process.argv[1]?.includes('capture-previews')) {
  main()
    .then(async () => {
      await closeDatabase();
      process.exit(0);
    })
    .catch(async (error: unknown) => {
      process.stderr.write(`\nPreview capture failed: ${(error as Error).message}\n\n`);
      await closeDatabase().catch(() => undefined);
      process.exit(1);
    });
}
