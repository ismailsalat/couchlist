import { parseExternalUrl } from '../watch/url.js';
import { icoToPng, isIco } from './ico.js';
import { ICON_MAX_BYTES, checkIconUpload, type IconCheck } from './icon.js';

/**
 * Fetching a site's own icon.
 *
 * Adding fifty listings by hand means finding fifty icons by hand, which is
 * the sort of work nobody does, which is why a directory ends up as a wall of
 * grey squares. The site already publishes one; this goes and gets it.
 *
 * Two rules it does not bend:
 *
 *  1. Every candidate address is re-validated with `parseExternalUrl` before
 *     it is requested, including after a redirect. The site chooses where its
 *     icon lives and where a redirect goes, so without that this would be a
 *     confused deputy fetching whatever a listed site points it at, including
 *     addresses on our own network.
 *
 *  2. The bytes go through exactly the same check an uploaded icon does. A
 *     favicon that is really an HTML error page, an SVG, or forty megabytes
 *     is rejected the same way a contributor's bad upload is.
 *
 * It looks in two places, in this order: the icons the page declares in its
 * own HTML, which is where a site says what its icon actually is, and then
 * the conventional paths. Guessing paths alone was why this used to fail on
 * most sites — plenty of them keep their icon somewhere else entirely, and
 * the one path nearly everybody does have, `/favicon.ico`, was fetched and
 * then refused for being an ICO. ICO files are now converted to PNG.
 */

/**
 * Where sites conventionally keep an icon, best first.
 *
 * `apple-touch-icon.png` leads because it is large, square and always a real
 * PNG. `/favicon.ico` is last of the guesses but is the one almost every site
 * has, which is why converting it matters more than its position.
 */
export const ICON_CANDIDATE_PATHS = [
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/icon.png',
  '/favicon.png',
  '/favicon.ico',
] as const;

/** Enough HTML to hold a head full of link tags. */
const MAX_HTML_BYTES = 512_000;

/**
 * The icons a page declares about itself.
 *
 * Returned largest-first by the size the page claims, because a site that
 * offers a 180px icon and a 16px one meant the big one to be used. An
 * undeclared size sorts in the middle: unknown is not the same as tiny.
 */
export function readDeclaredIcons(html: string, pageUrl: URL): string[] {
  const head = html.slice(0, MAX_HTML_BYTES);
  const base = /<base[^>]+href=["']([^"']+)["']/i.exec(head)?.[1];

  let root = pageUrl;
  if (base) {
    try {
      root = new URL(base, pageUrl);
    } catch {
      // A malformed base tag. The page URL is a perfectly good root.
    }
  }

  const found: Array<{ url: string; area: number }> = [];

  for (const tag of head.match(/<link[^>]+>/gi) ?? []) {
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const relations = rel.split(/\s+/);
    if (!relations.some((value) => value === 'icon' || value.startsWith('apple-touch-icon'))) {
      continue;
    }

    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1]?.trim();
    if (!href) continue;

    // "32x32", or "any" for an SVG, or several sizes in one attribute.
    const sizes = /sizes=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const biggest = [...sizes.matchAll(/(\d+)x(\d+)/g)].reduce(
      (best, match) => Math.max(best, Number(match[1]) * Number(match[2])),
      0,
    );

    try {
      found.push({
        url: new URL(href, root).toString(),
        // Unknown sits above the small declared sizes and below the large.
        area: biggest || 64 * 64,
      });
    } catch {
      // An href that is not a URL. Nothing to fetch.
    }
  }

  const seen = new Set<string>();
  return found
    .sort((a, b) => b.area - a.area)
    .map((entry) => entry.url)
    .filter((url) => (seen.has(url) ? false : seen.add(url)));
}

export type IconFetch =
  | { ok: true; mime: string; bytes: Buffer; byteSize: number; from: string }
  | { ok: false; message: string };

export type FetchLike = (url: string, init: { signal: AbortSignal; redirect: 'manual' }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** Follows at most this many redirects for one candidate address. */
const MAX_REDIRECTS = 3;

async function fetchOne(
  url: string,
  doFetch: FetchLike,
  timeoutMs: number,
): Promise<IconCheck | null> {
  let current = parseExternalUrl(url);
  if (!current) return null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await doFetch(current.url.toString(), {
        signal: controller.signal,
        redirect: 'manual',
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;
      // Re-validated every hop: the previous address does not vouch for this one.
      const next = parseExternalUrl(new URL(location, current.url).toString());
      if (!next) return null;
      current = next;
      continue;
    }

    if (response.status !== 200) return null;

    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > ICON_MAX_BYTES) return null;

    let buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > ICON_MAX_BYTES) return null;

    /*
     * Almost every site has a favicon.ico and the directory stores PNG, JPEG
     * and WebP only. Converting here means the stored bytes are a real PNG,
     * checked by the same gate as any upload — rather than widening what the
     * database is allowed to hold for the sake of one format.
     */
    if (isIco(buffer)) {
      const converted = icoToPng(buffer);
      if (!converted) return null;
      buffer = converted;
    }

    // The same gate an upload goes through, including sniffing the real type.
    return checkIconUpload(buffer.toString('base64'));
  }

  return null;
}

/**
 * Tries the usual icon addresses and returns the first real image.
 *
 * `.ico` files are not accepted by the image check on purpose: the directory
 * serves PNG, JPEG and WebP only, and widening that for a convenience feature
 * would widen it for uploads too.
 */
export async function fetchSiteIcon(
  homepageUrl: string,
  doFetch: FetchLike,
  options: { timeoutMs?: number; paths?: readonly string[] } = {},
): Promise<IconFetch> {
  const timeoutMs = options.timeoutMs ?? 6_000;
  const start = parseExternalUrl(homepageUrl);
  if (!start) return { ok: false, message: 'That address cannot be fetched.' };

  /*
   * Ask the page first.
   *
   * Guessing paths alone is why this used to fail on most sites: plenty keep
   * their icon on a CDN, or under a hashed filename, and say so in a link tag
   * that nobody was reading. The conventional paths are still tried, after,
   * because a site that declares nothing usually still has one of them.
   */
  const declared: string[] = [];
  if (!options.paths) {
    try {
      const page = await fetchHtml(start.url, doFetch, timeoutMs);
      if (page) declared.push(...readDeclaredIcons(page, start.url));
    } catch {
      // A page that will not load may still have a favicon at a known path.
    }
  }

  const guesses = (options.paths ?? ICON_CANDIDATE_PATHS).map((path) =>
    new URL(path, start.url).toString(),
  );

  const seen = new Set<string>();
  for (const candidate of [...declared, ...guesses]) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);

    const result = await fetchOne(candidate, doFetch, timeoutMs);
    if (result?.ok) {
      return {
        ok: true,
        mime: result.mime,
        bytes: result.bytes,
        byteSize: result.byteSize,
        from: candidate,
      };
    }
  }

  return {
    ok: false,
    message: 'No usable icon found. Upload one instead.',
  };
}

/** The page's HTML, for reading its link tags. Null when it will not load. */
async function fetchHtml(url: URL, doFetch: FetchLike, timeoutMs: number): Promise<string | null> {
  let current = parseExternalUrl(url.toString());
  if (!current) return null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await doFetch(current.url.toString(), {
        signal: controller.signal,
        redirect: 'manual',
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;
      const next = parseExternalUrl(new URL(location, current.url).toString());
      if (!next) return null;
      current = next;
      continue;
    }

    if (response.status !== 200) return null;

    // Truncated, not refused: the link tags are in the <head>, and throwing
    // away a large page means failing on exactly the big, well-made sites.
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.subarray(0, MAX_HTML_BYTES).toString('utf8');
  }

  return null;
}
