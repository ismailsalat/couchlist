import { parseExternalUrl } from '../watch/url.js';
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
 */

/** Where sites conventionally keep an icon, best first. */
export const ICON_CANDIDATE_PATHS = [
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/favicon.png',
  '/icon.png',
] as const;

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

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > ICON_MAX_BYTES) return null;

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

  for (const path of options.paths ?? ICON_CANDIDATE_PATHS) {
    const candidate = new URL(path, start.url).toString();
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
    message: 'No usable icon found at the usual addresses. Upload one instead.',
  };
}
