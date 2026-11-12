import { parseExternalUrl } from '../watch/url.js';

/**
 * Turning what somebody pasted into a list of page links.
 *
 * This is the "paste a link and read it" path, and it is deliberately the
 * narrow version: direct image links, one per line. A link to a *chapter
 * page* cannot work from the website alone — reading one means fetching
 * another site's HTML, which the browser refuses cross-origin, and doing it
 * on our server would make Couchlist a proxy for other people's comics.
 * `classifyReaderLink` exists to say that plainly instead of failing with a
 * network error nobody can act on.
 *
 * Every link goes through `parseExternalUrl`, the same check the safety tool
 * uses, so a private address, a loopback host or a non-http scheme is refused
 * before it can reach an <img> tag.
 */

export type ReaderLinkKind = 'image' | 'needs-extension' | 'rejected';

export interface ClassifiedLink {
  raw: string;
  kind: ReaderLinkKind;
  /** Normalised absolute URL, for an accepted image link. */
  url?: string;
  /** Why it was refused, in words a reader can act on. */
  reason?: string;
}

/** Extensions a browser will actually decode as an image. */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp'] as const;

function looksLikeImage(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

/**
 * Decide what a single pasted line is.
 *
 * `assumeImage` is set when the reader has explicitly said "these are image
 * links", because plenty of image endpoints have no file extension at all
 * (`/render?id=8`). Without that flag an extensionless URL is reported as
 * needing the extension rather than silently rendering as a broken page.
 */
export function classifyReaderLink(raw: string, assumeImage = false): ClassifiedLink {
  const trimmed = raw.trim();
  if (!trimmed) return { raw, kind: 'rejected', reason: 'Empty line.' };

  const parsed = parseExternalUrl(trimmed);
  if (!parsed) {
    return {
      raw: trimmed,
      kind: 'rejected',
      reason: 'Not a public http:// or https:// address.',
    };
  }

  if (assumeImage || looksLikeImage(parsed.url)) {
    return { raw: trimmed, kind: 'image', url: parsed.url.toString() };
  }

  return {
    raw: trimmed,
    kind: 'needs-extension',
    reason: 'This looks like a chapter page, not an image. Reading one needs the companion extension.',
  };
}

export interface ClassifiedLinks {
  images: string[];
  needsExtension: ClassifiedLink[];
  rejected: ClassifiedLink[];
}

/** The most pages one pasted list may produce. */
export const MAX_LINKED_PAGES = 400;

/** Classify a pasted block, one link per line, keeping the given order. */
export function classifyReaderLinks(input: string, assumeImage = false): ClassifiedLinks {
  const lines = input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  const images: string[] = [];
  const needsExtension: ClassifiedLink[] = [];
  const rejected: ClassifiedLink[] = [];
  const seen = new Set<string>();

  for (const line of lines.slice(0, MAX_LINKED_PAGES)) {
    const result = classifyReaderLink(line, assumeImage);
    if (result.kind === 'image' && result.url) {
      // Order is the reading order, so a duplicate is dropped, not reordered.
      if (seen.has(result.url)) continue;
      seen.add(result.url);
      images.push(result.url);
    } else if (result.kind === 'needs-extension') {
      needsExtension.push(result);
    } else {
      rejected.push(result);
    }
  }

  return { images, needsExtension, rejected };
}
