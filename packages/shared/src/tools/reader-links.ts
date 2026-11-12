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

/* -------------------------------------------------------------------------
 * Chapter handover
 *
 * The extension passes a chapter to the reader in the URL fragment, which
 * never reaches a server. That also means anyone can craft one, so none of it
 * is trusted: every page and link is re-validated here with the same checks a
 * pasted link gets, and every string is bounded. A handover that fails is
 * reported, not partially applied.
 * ---------------------------------------------------------------------- */

export interface HandoverChapter {
  title: string;
  sourceUrl: string | null;
  pages: string[];
  chapters: Array<{ url: string; label: string }>;
  previous: string | null;
  next: string | null;
  /** The source used size-based guessing, so order may be wrong. */
  guessed: boolean;
}

export interface HandoverResult {
  chapter: HandoverChapter | null;
  /** Why it could not be used, for the reader to show. */
  problem?: string;
}

const MAX_HANDOVER_PAGES = 1500;

function safeUrl(value: unknown, base?: string): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const resolved = base ? new URL(value, base).toString() : value;
    return parseExternalUrl(resolved) ? new URL(resolved).toString() : null;
  } catch {
    return null;
  }
}

function text(value: unknown, limit: number, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : fallback;
}

/** Validate a chapter handed over by the extension. */
export function parseHandover(raw: unknown): HandoverResult {
  if (typeof raw !== 'object' || raw === null) return { chapter: null, problem: 'Not a chapter.' };
  const input = raw as Record<string, unknown>;

  const sourceUrl = safeUrl(input.sourceUrl);
  const rawPages = Array.isArray(input.pages) ? input.pages : [];
  if (rawPages.length === 0) return { chapter: null, problem: 'That chapter had no pages in it.' };

  const pages: string[] = [];
  const seen = new Set<string>();
  for (const entry of rawPages.slice(0, MAX_HANDOVER_PAGES)) {
    const value = typeof entry === 'string' ? entry : (entry as { url?: unknown } | null)?.url;
    const url = safeUrl(value, sourceUrl ?? undefined);
    // Order is reading order, so a duplicate is dropped rather than moved.
    if (url && !seen.has(url)) {
      seen.add(url);
      pages.push(url);
    }
  }
  if (pages.length === 0) {
    return { chapter: null, problem: 'None of that chapter’s image links could be used.' };
  }

  const rawChapters = Array.isArray(input.candidates)
    ? input.candidates
    : Array.isArray(input.chapters)
      ? input.chapters
      : [];
  const chapters: Array<{ url: string; label: string }> = [];
  for (const entry of rawChapters.slice(0, 5000)) {
    const item = entry as { url?: unknown; label?: unknown } | null;
    const url = safeUrl(item?.url, sourceUrl ?? undefined);
    if (url) chapters.push({ url, label: text(item?.label, 200, '') });
  }

  return {
    chapter: {
      title: text(input.title, 250, 'Chapter'),
      sourceUrl,
      pages,
      chapters,
      previous: safeUrl(input.previous, sourceUrl ?? undefined),
      next: safeUrl(input.next, sourceUrl ?? undefined),
      guessed: input.guessed === true,
    },
  };
}

/** Read a handover out of a location fragment, if there is one. */
export function handoverFromHash(hash: string): HandoverResult | null {
  const match = /(?:^#|&)chapter=([^&]+)/u.exec(hash);
  if (!match?.[1]) return null;
  try {
    return parseHandover(JSON.parse(decodeURIComponent(match[1])));
  } catch {
    return { chapter: null, problem: 'That link was not a readable chapter.' };
  }
}

/* -------------------------------------------------------------------------
 * Extension version
 * ---------------------------------------------------------------------- */

/**
 * The oldest extension this reader can work with.
 *
 * Raised whenever the reader starts depending on something the extension did
 * not do before. 0.2.0 is where page images began coming back through the
 * extension; before that the reader loaded them directly, which a source's
 * CDN refuses.
 *
 * Without this check the two failures are indistinguishable — an old
 * extension and no extension both simply never answer — and the reader can
 * only say "no reply", which tells somebody nothing about what to do.
 */
export const EXTENSION_MIN_VERSION = '0.2.0';

/** True when `version` is at least `minimum`. Non-numeric parts sort low. */
export function versionAtLeast(version: string, minimum = EXTENSION_MIN_VERSION): boolean {
  const parts = (value: string) =>
    value.split('.').map((piece) => {
      const number = Number.parseInt(piece, 10);
      return Number.isFinite(number) ? number : 0;
    });

  const left = parts(version);
  const right = parts(minimum);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

export type ExtensionState = 'ready' | 'outdated' | 'missing';
