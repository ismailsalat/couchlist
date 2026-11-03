import { parseExternalUrl } from '../watch/url.js';
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

/** Reads the share image out of a page's HTML. Null when it does not say. */
export function readShareImage(html: string, pageUrl: URL): string | null {
  const head = html.slice(0, MAX_HTML_BYTES);

  // Property order varies, so match the tag first and pull the parts out.
  const candidates = [
    /<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]*>/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*>/gi,
    /<meta[^>]+name=["']og:image["'][^>]*>/gi,
  ];

  for (const pattern of candidates) {
    const tags = head.match(pattern);
    if (!tags) continue;

    for (const tag of tags) {
      const content = /content=["']([^"']+)["']/i.exec(tag)?.[1];
      if (!content) continue;
      try {
        return new URL(content.trim(), pageUrl).toString();
      } catch {
        // A content attribute that is not a URL. Try the next tag.
      }
    }
  }

  return null;
}

async function get(
  url: URL,
  doFetch: FetchLike,
  timeoutMs: number,
  maxHops: number,
  maxBytes: number,
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
    if (Number.isFinite(declared) && declared > maxBytes) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) return null;

    return { status: response.status, headers: response.headers, bytes };
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

  const html = await get(page.url, doFetch, timeoutMs, 3, MAX_HTML_BYTES);
  if (!html || html.status !== 200) {
    return { ok: false, message: 'The site did not answer. Upload a picture instead.' };
  }

  const imageUrl = readShareImage(html.bytes.toString('utf8'), page.url);
  if (!imageUrl) {
    return {
      ok: false,
      message: 'This site does not publish a preview picture. Upload one instead.',
    };
  }

  const validated = parseExternalUrl(imageUrl);
  if (!validated) {
    return { ok: false, message: 'The picture it points at cannot be fetched.' };
  }

  // The image may be larger than the page that pointed at it.
  const image = await get(validated.url, doFetch, timeoutMs, 3, PREVIEW_MAX_BYTES);
  if (!image || image.status !== 200) {
    return { ok: false, message: 'The picture it points at did not load.' };
  }

  // The same gate an uploaded image goes through, including reading the real
  // type from the leading bytes rather than trusting what the site said.
  const check = checkIconUpload(image.bytes.toString('base64'), PREVIEW_MAX_BYTES);
  if (!check.ok) return { ok: false, message: check.message };

  return {
    ok: true,
    mime: check.mime,
    bytes: check.bytes,
    byteSize: check.byteSize,
    from: validated.url.toString(),
  };
}
