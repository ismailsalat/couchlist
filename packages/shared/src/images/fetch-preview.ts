import { parseExternalUrl } from '../watch/url.js';
import { readImageSize } from './dimensions.js';
import { PREVIEW_MAX_BYTES, checkIconUpload } from './icon.js';
import type { FetchLike } from './fetch-icon.js';

/**
 * The picture a site publishes of itself.
 *
 * This reads the site's own Open Graph or Twitter card image — the one it
 * puts in its HTML specifically so that other people's pages can show it when
 * the site is linked. That provenance is the whole reason this exists rather
 * than a screenshot: a screenshot is a copy somebody took of a page, while a
 * share image is artwork the site published for exactly this use. For a
 * directory whose defence is "we list, we do not host", the difference is not
 * decoration.
 *
 * Every address — the page, and whatever the image tag points at, and any
 * redirect either of them takes — is re-validated before it is requested, so
 * a listed site cannot use its own HTML to point our server at an address on
 * our network.
 */

export type PreviewFetch =
  | { ok: true; mime: string; bytes: Buffer; byteSize: number; from: string }
  | { ok: false; message: string };

/** Enough HTML to hold a head full of meta tags, and no more. */
const MAX_HTML_BYTES = 512_000;

/**
 * The smallest a preview may be and still show what a page looks like.
 *
 * Plenty of sites set their share image to a logo, and a logo in the place a
 * reader expects a picture of the site is worse than nothing: it says the
 * feature is broken. A picture of a page is wide and reasonably large; a
 * logo is small, square, or both.
 */
export const PREVIEW_MIN_WIDTH = 480;
export const PREVIEW_MIN_HEIGHT = 240;
/** Below this, the image is taller than it is wide, or barely wider. */
export const PREVIEW_MIN_RATIO = 1.2;

/** Whether an image looks like a page rather than a logo. */
export function looksLikeAPage(bytes: Buffer): { ok: true } | { ok: false; why: string } {
  const size = readImageSize(bytes);
  if (!size) {
    // Unmeasurable, which is not the same as wrong. The upload check has
    // already confirmed it is a real image of an accepted type.
    return { ok: true };
  }

  if (size.width < PREVIEW_MIN_WIDTH || size.height < PREVIEW_MIN_HEIGHT) {
    return {
      ok: false,
      why: `that picture is only ${size.width}×${size.height}, which is a logo rather than a view of the page`,
    };
  }

  const ratio = size.width / size.height;
  if (ratio < PREVIEW_MIN_RATIO) {
    return {
      ok: false,
      why: `that picture is ${size.width}×${size.height}, which is square enough to be a logo`,
    };
  }

  return { ok: true };
}

/** Reads the share image out of a page's HTML. Null when it does not say. */
export function readShareImages(html: string, pageUrl: URL): string[] {
  const head = html.slice(0, MAX_HTML_BYTES);

  // Property order varies, so match the tag first and pull the parts out.
  const candidates = [
    /<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]*>/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*>/gi,
    /<meta[^>]+name=["']og:image["'][^>]*>/gi,
  ];

  const found: string[] = [];

  for (const pattern of candidates) {
    for (const tag of head.match(pattern) ?? []) {
      const content = /content=["']([^"']+)["']/i.exec(tag)?.[1];
      if (!content) continue;
      try {
        const url = new URL(content.trim(), pageUrl).toString();
        if (!found.includes(url)) found.push(url);
      } catch {
        // A content attribute that is not a URL. Try the next tag.
      }
    }
  }

  return found;
}

/** The first picture a page offers. Kept for callers that want just one. */
export function readShareImage(html: string, pageUrl: URL): string | null {
  return readShareImages(html, pageUrl)[0] ?? null;
}

async function get(
  url: URL,
  doFetch: FetchLike,
  timeoutMs: number,
  maxHops: number,
  maxBytes: number,
  /**
   * What to do with something bigger than the cap.
   *
   * For an image, refuse it: half a picture is no picture. For a page, keep
   * the first part — the tags being looked for are in the `<head>`, and
   * refusing a large page outright is why this used to fail on exactly the
   * big, well-made sites most worth showing a preview of.
   */
  onOversize: 'refuse' | 'truncate' = 'refuse',
): Promise<{ status: number; headers: { get(name: string): string | null }; bytes: Buffer } | null> {
  let current = parseExternalUrl(url.toString());
  if (!current) return null;

  for (let hop = 0; hop <= maxHops; hop += 1) {
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

    const declared = Number(response.headers.get('content-length'));
    if (onOversize === 'refuse' && Number.isFinite(declared) && declared > maxBytes) return null;

    const whole = Buffer.from(await response.arrayBuffer());
    if (whole.length > maxBytes) {
      if (onOversize === 'refuse') return null;
      return {
        status: response.status,
        headers: response.headers,
        bytes: whole.subarray(0, maxBytes),
      };
    }

    return { status: response.status, headers: response.headers, bytes: whole };
  }

  return null;
}

export async function fetchSitePreview(
  homepageUrl: string,
  doFetch: FetchLike,
  options: { timeoutMs?: number } = {},
): Promise<PreviewFetch> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const page = parseExternalUrl(homepageUrl);
  if (!page) return { ok: false, message: 'That address cannot be fetched.' };

  const html = await get(page.url, doFetch, timeoutMs, 3, MAX_HTML_BYTES, 'truncate');
  if (!html || html.status !== 200) {
    return { ok: false, message: 'The site did not answer. Upload a picture instead.' };
  }

  /*
   * Every picture the page offers, not just the first.
   *
   * The first tag a site declares is often a square brand mark and the next
   * is the wide card meant for sharing, so stopping at the first is how a
   * listing ends up showing a logo stretched across the top.
   */
  const candidates = readShareImages(html.bytes.toString('utf8'), page.url);
  if (candidates.length === 0) {
    return {
      ok: false,
      message:
        'This site does not publish a preview picture. Take a screenshot or upload one instead.',
    };
  }

  let logoReason: string | null = null;

  for (const imageUrl of candidates.slice(0, 4)) {
    const validated = parseExternalUrl(imageUrl);
    if (!validated) continue;

    // The image may be larger than the page that pointed at it.
    const image = await get(validated.url, doFetch, timeoutMs, 3, PREVIEW_MAX_BYTES);
    if (!image || image.status !== 200) continue;

    // The same gate an uploaded image goes through, including reading the real
    // type from the leading bytes rather than trusting what the site said.
    const check = checkIconUpload(image.bytes.toString('base64'), PREVIEW_MAX_BYTES);
    if (!check.ok) continue;

    // And then the question the type check cannot answer: is this a picture
    // of a page, or did the site point us at its logo?
    const shape = looksLikeAPage(check.bytes);
    if (!shape.ok) {
      logoReason ??= shape.why;
      continue;
    }

    return {
      ok: true,
      mime: check.mime,
      bytes: check.bytes,
      byteSize: check.byteSize,
      from: validated.url.toString(),
    };
  }

  return {
    ok: false,
    message: logoReason
      ? `This site publishes a picture, but ${logoReason}. Take a screenshot instead.`
      : 'The pictures this site points at did not load. Take a screenshot instead.',
  };
}
