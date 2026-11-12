import { parseExternalUrl } from '../watch/url.js';

/**
 * Working out which link is the next chapter — without guessing.
 *
 * Ported from the desktop reader's navigation rules, which exist because the
 * naive approach is wrong in a way that looks right. `/chapter/9555322` is a
 * database ID, not chapter 9,555,322, and adding one to it lands on an
 * unrelated comic. `/c50` may be chapter 50, but `50.5` could be followed by
 * `50.6`, `51`, or a bonus chapter with no number at all.
 *
 * So this module never invents a URL. It reads the links a source actually
 * published, decides which of them are siblings of the chapter being read,
 * and orders them. If that yields nothing, the answer is "unknown" and the
 * reader asks for a link — it never claims the series has ended.
 *
 * The safeguard that does the heavy lifting is the **family**: the host plus
 * the path with the chapter number blanked out. Two links are comparable
 * chapters only if they share a family, which is what stops a "you might also
 * like" card in the sidebar being treated as chapter 51.
 */

export interface ChapterNumber {
  /** Parsed value. 50.5 stays 50.5. */
  value: number;
  /** As written, so leading zeroes survive. */
  raw: string;
  /**
   * Host plus the path shape with the number replaced. Two chapters of the
   * same series share this; a link to anything else does not.
   */
  family: string;
}

/*
 * Deliberately does not interpret database IDs, `page=`, volume numbers or
 * dates. A number only counts when the URL says what kind of number it is.
 */
const PATH_MARKED =
  /(?:^|\/|[-_])(?:chapters?|chap|ch|c|episodes?|ep)[_/-]?(\d+(?:\.\d+)?)(?:[-_][^/]*)?(?:\.html?)?\/?$/iu;

const QUERY_KEYS = [
  'chapter',
  'chapter_number',
  'chapter_num',
  'chapter_no',
  'chap',
  'ch',
  'c',
  'episode',
  'ep',
] as const;

/** Hosts whose chapter URLs carry database IDs, so the digits mean nothing. */
const OPAQUE_ID_HOSTS = [/(^|\.)mangafire\.to$/iu, /(^|\.)weebcentral\.com$/iu];

function host(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./u, '');
}

/** Read a chapter number out of a URL, or null when there isn't one. */
export function chapterNumber(input: string | URL): ChapterNumber | null {
  let url: URL;
  try {
    url = input instanceof URL ? input : new URL(input);
  } catch {
    return null;
  }

  // These sites put row IDs in the path. Reading one as a chapter number is
  // how "next chapter" ends up on a different comic entirely.
  if (OPAQUE_ID_HOSTS.some((pattern) => pattern.test(host(url)))) return null;

  for (const key of QUERY_KEYS) {
    const raw = url.searchParams.get(key);
    if (raw && /^\d+(?:\.\d+)?$/u.test(raw)) {
      // Other query values may hold the series ID, so they stay in the family.
      const rest = new URLSearchParams(url.searchParams);
      rest.set(key, '{n}');
      return { value: Number(raw), raw, family: `${host(url)}${url.pathname}?${rest.toString()}` };
    }
  }

  const marked = PATH_MARKED.exec(url.pathname);
  if (marked?.[1]) {
    // The chapter's title suffix can differ between chapters, so the family
    // is only the part of the path *before* the number.
    const prefix = url.pathname.slice(0, marked.index).replace(/\/+$/u, '');
    return { value: Number(marked[1]), raw: marked[1], family: `${host(url)}${prefix}` };
  }

  return null;
}

/** Whether two URLs are chapters of the same thing. */
export function sameFamily(a: string, b: string): boolean {
  const left = chapterNumber(a);
  const right = chapterNumber(b);
  if (!left || !right) return false;
  return left.family === right.family;
}

export interface ChapterLink {
  url: string;
  label: string;
  /** null when the label and URL carry no usable number. */
  number: number | null;
}

/** Pull a chapter number out of human text like "Chapter 65.5" or "Ch. 7". */
export function labelNumber(label: string): number | null {
  const match = /\b(?:chapter|chap|ch|episode|ep)\.?\s*[-:#]?\s*(\d+(?:\.\d+)?)\b/iu.exec(label);
  return match?.[1] ? Number(match[1]) : null;
}

/**
 * Accept a link as a possible chapter, or reject it with a reason.
 *
 * Same-origin only, never the page we are already on, and never a different
 * family. The family check is what keeps sidebar recommendations out.
 */
export function allowedChapterLink(base: string, href: string): string | null {
  if (!href || /^\s*(?:#|javascript:|data:|mailto:)/iu.test(href)) return null;

  let target: URL;
  let from: URL;
  try {
    from = new URL(base);
    target = new URL(href, base);
  } catch {
    return null;
  }

  const checked = parseExternalUrl(target.toString());
  if (!checked) return null;
  if (host(target) !== host(from)) return null;

  const canonical = (u: URL) => `${u.origin}${u.pathname.replace(/\/+$/u, '')}${u.search}`;
  if (canonical(target) === canonical(from)) return null;

  const here = chapterNumber(from);
  const there = chapterNumber(target);
  // Both numbered: they must belong to the same series and differ.
  if (here && there && (here.family !== there.family || here.value === there.value)) return null;

  return target.toString();
}

/**
 * Clean a collected list into ordered chapters.
 *
 * Sorted by number only when *every* entry has one. A list where some
 * chapters are numbered and others are not (specials, extras, side stories)
 * keeps the order the source published, because a partial sort scatters the
 * unnumbered ones to the front and reads as data loss.
 */
export function orderChapters(
  raw: Array<{ url: string; label?: string }>,
  base?: string,
): ChapterLink[] {
  const seen = new Set<string>();
  const out: ChapterLink[] = [];

  for (const entry of raw.slice(0, 5000)) {
    let url: string;
    try {
      const resolved = base ? new URL(entry.url, base) : new URL(entry.url);
      const checked = parseExternalUrl(resolved.toString());
      if (!checked) continue;
      url = resolved.toString();
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);

    const label = (entry.label ?? '').trim().slice(0, 200);
    const number = labelNumber(label) ?? chapterNumber(url)?.value ?? null;
    out.push({ url, label: label || (number === null ? 'Chapter link' : `Chapter ${number}`), number });
  }

  if (out.length > 0 && out.every((entry) => entry.number !== null)) {
    out.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  }
  return out;
}

export type NeighbourKind = 'source-link' | 'chapter-list' | 'unknown';

export interface Neighbour {
  kind: NeighbourKind;
  url: string | null;
}

export interface Neighbours {
  previous: Neighbour;
  next: Neighbour;
}

/**
 * Where previous and next go.
 *
 * A link the source itself published always wins; the chapter list is the
 * fallback. Anything else is `unknown` — which the reader must present as
 * "we could not find it", never as the end of the series. A source that
 * simply has no next link is not a source saying the story is over.
 */
export function neighbours(
  current: string,
  chapters: ChapterLink[],
  published: { previous?: string | null; next?: string | null } = {},
): Neighbours {
  const pick = (
    explicit: string | null | undefined,
    step: -1 | 1,
  ): Neighbour => {
    if (explicit) {
      const allowed = allowedChapterLink(current, explicit);
      if (allowed) return { kind: 'source-link', url: allowed };
    }

    const index = chapters.findIndex((entry) => entry.url === current);
    if (index !== -1) {
      const neighbour = chapters[index + step];
      if (neighbour) return { kind: 'chapter-list', url: neighbour.url };
    }
    return { kind: 'unknown', url: null };
  };

  return { previous: pick(published.previous, -1), next: pick(published.next, 1) };
}
