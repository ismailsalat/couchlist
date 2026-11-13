/**
 * Finding a chapter's pages in its HTML.
 *
 * A deliberately narrow reader rather than a full HTML parser. All that is
 * wanted is `<img>` tags, a handful of their attributes, and `<a href>`; a
 * parser dependency would add build time for no gain on a job this small.
 * Ported from the desktop reader's extractor, which has the advantage of
 * having been run against real chapter pages.
 *
 * The important behaviours, each of which exists because the naive version
 * gets it wrong:
 *
 *  - Lazy-loaded pages keep the real address in `data-src` and friends while
 *    `src` holds a placeholder, so the data attributes are preferred.
 *  - Images inside the reader's own container are preferred over every image
 *    on the page; falling back to "all images" picks up avatars and banners,
 *    so that case is reported as `guessed` and the reader warns.
 *  - Each image's `referrerpolicy` is recorded, because a CDN that serves
 *    only when the Referer is the bare origin answers 403 to the full
 *    chapter URL. One guess for the whole chapter is not good enough.
 */

export interface ChapterImage {
  url: string;
  /** '' means send no Referer. */
  referer: string;
}

export interface ExtractedChapter {
  pages: ChapterImage[];
  links: Array<{ url: string; label: string }>;
  title: string;
  /** True when the pages came from the fallback and may be wrong. */
  guessed: boolean;
}

/** Containers reader pages live in, across the common site templates. */
const READER_CONTAINER =
  /reading-content|reader-area|reader-content|chapter-content|chapter-images|manga-reader|comic-reader|page-break|read-container|viewer-pages|\bimgs\b/iu;

/** Names that mark an image as furniture rather than a page. */
const FURNITURE = /(?:^|[/_\-. ])(?:ads?|advertisement|banner|logo|avatar|icon|tracking|pixel|sprite)(?:$|[/_\-. ])/iu;

const IMAGE_ATTRIBUTES = ['data-src', 'data-lazy-src', 'data-original', 'data-url', 'src'] as const;

/** Read one attribute out of a tag's source text. */
function attribute(tag: string, name: string): string {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'iu').exec(tag);
  return (match?.[2] ?? match?.[3] ?? match?.[4] ?? '').trim();
}

function absolute(value: string, base: string): string | null {
  if (!value || /^(?:data:|javascript:|blob:|#)/iu.test(value)) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (/\.(?:svg|ico)(?:$|\?)/iu.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function refererFor(tag: string, base: string): string {
  const policy = attribute(tag, 'referrerpolicy').toLowerCase();
  if (policy === 'no-referrer') return '';
  if (policy === 'origin' || policy === 'strict-origin' || policy === 'origin-when-cross-origin') {
    try {
      return new URL(base).origin + '/';
    } catch {
      return base;
    }
  }
  return base;
}

/**
 * Whether this `<img>` sits inside the reader's own container.
 *
 * Judged by what comes before it in the document rather than by walking a
 * tree: the nearest preceding opening tag that names a reader container,
 * with no matching close since, means the image is inside one. Rough, and
 * good enough to separate the pages from the page furniture.
 */
function readerRegions(html: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  const opening = /<(div|section|article|main)\b[^>]*>/giu;

  let match: RegExpExecArray | null;
  while ((match = opening.exec(html)) !== null) {
    const tag = match[0];
    const classes = `${attribute(tag, 'class')} ${attribute(tag, 'id')}`;
    if (!READER_CONTAINER.test(classes)) continue;

    // Everything from here to the end of the document; overlapping regions
    // are harmless because membership is only ever a boolean.
    regions.push([match.index, html.length]);
  }
  return regions;
}

const EXCLUDED_BLOCK = /<(nav|header|footer|aside|script|noscript|style)\b/giu;

function excludedRegions(html: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  let match: RegExpExecArray | null;
  while ((match = EXCLUDED_BLOCK.exec(html)) !== null) {
    const name = match[1]!.toLowerCase();
    const close = html.toLowerCase().indexOf(`</${name}`, match.index);
    regions.push([match.index, close === -1 ? match.index + 2000 : close]);
  }
  return regions;
}

const inside = (at: number, regions: Array<[number, number]>) =>
  regions.some(([from, to]) => at >= from && at <= to);

export function extractChapter(html: string, base: string): ExtractedChapter {
  const reader = readerRegions(html);
  const excluded = excludedRegions(html);

  const scoped: ChapterImage[] = [];
  const loose: ChapterImage[] = [];
  const seen = new Set<string>();

  const images = /<img\b[^>]*>/giu;
  let match: RegExpExecArray | null;
  while ((match = images.exec(html)) !== null) {
    const tag = match[0];
    if (inside(match.index, excluded)) continue;

    const names = `${attribute(tag, 'class')} ${attribute(tag, 'id')} ${attribute(tag, 'alt')}`;
    if (FURNITURE.test(names)) continue;

    let source = '';
    for (const name of IMAGE_ATTRIBUTES) {
      const value = attribute(tag, name);
      // A placeholder of "#" is MangaKatana's way of saying "not yet loaded".
      if (value && value !== '#' && !value.startsWith('data:')) {
        source = value;
        break;
      }
    }
    if (!source) {
      const set = attribute(tag, 'data-srcset') || attribute(tag, 'srcset');
      if (set) source = set.split(',').pop()!.trim().split(/\s+/u)[0] ?? '';
    }

    const url = absolute(source, base);
    if (!url || seen.has(url) || FURNITURE.test(new URL(url).pathname)) continue;
    seen.add(url);

    const entry: ChapterImage = { url, referer: refererFor(tag, base) };
    (inside(match.index, reader) ? scoped : loose).push(entry);
  }

  const links: Array<{ url: string; label: string }> = [];
  const anchors = /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]{0,300}?)<\/a>/giu;
  while ((match = anchors.exec(html)) !== null) {
    const href = absolute((match[1] ?? match[2] ?? match[3] ?? '').trim(), base);
    if (!href) continue;
    const label = (match[4] ?? '').replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim();
    links.push({ url: href, label: label.slice(0, 200) });
  }

  // Chapter menus are frequently a <select> rather than links.
  const options = /<option\b[^>]*value\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]{0,200}?)<\/option>/giu;
  while ((match = options.exec(html)) !== null) {
    const href = absolute((match[1] ?? match[2] ?? '').trim(), base);
    if (href) {
      links.push({ url: href, label: (match[3] ?? '').replace(/\s+/gu, ' ').trim().slice(0, 200) });
    }
  }

  const title =
    /<h1\b[^>]*>([\s\S]{0,200}?)<\/h1>/iu.exec(html)?.[1]?.replace(/<[^>]*>/gu, '').trim() ||
    /<title\b[^>]*>([\s\S]{0,200}?)<\/title>/iu.exec(html)?.[1]?.trim() ||
    'Chapter';

  /*
   * Order of preference, each falling through to the next:
   *   1. images inside the reader's own container
   *   2. a page list embedded in a script
   *   3. any plausible image on the page
   *
   * The script list sits above loose images because when a page has both,
   * the script is the chapter and the loose ones are decoration. It sits
   * below the reader container because markup, where it exists, is the
   * source stating its own intent.
   */
  const scripted = scoped.length > 0 ? [] : pagesFromScripts(html, base);
  const pages = scoped.length > 0 ? scoped : scripted.length > 0 ? scripted : loose;

  return {
    pages,
    links,
    title: title.slice(0, 250),
    // Only the last resort is a guess; a script list is as deliberate as markup.
    guessed: scoped.length === 0 && scripted.length === 0,
  };
}

/* -------------------------------------------------------------------------
 * Pages hidden in a script
 *
 * Some readers do not put their pages in the markup at all. MangaKatana is
 * the clearest case: every `<img>` carries `data-src="#"` as a placeholder
 * and the real, correctly ordered addresses sit in a JavaScript array
 * (`var thzq = [...]`) that the page fills in later. Read the markup and you
 * find nothing, which is exactly what happened.
 *
 * So this reads the arrays out of the scripts — by pattern, never by running
 * them. Executing a source's JavaScript to find its images would mean
 * running a stranger's code on our server, and no page is worth that.
 *
 * Written generally rather than as a MangaKatana rule, because the same
 * shape turns up on a lot of sites: a literal list of image URLs assigned to
 * some variable. Anything that reaches the array is held to the same checks
 * as an `<img>`, so a script cannot smuggle in a `javascript:` URL.
 * ---------------------------------------------------------------------- */

/** The fewest URLs an array must hold before it looks like a chapter. */
const MIN_SCRIPT_PAGES = 3;

const LOOKS_LIKE_IMAGE = /\.(?:png|jpe?g|webp|avif|gif|bmp)(?:[?#]|$)/iu;

/**
 * Pull candidate page lists out of inline scripts.
 *
 * Returns the longest plausible list. Pages are ordered, and a page list is
 * normally the biggest array on the page, so length is a good discriminator
 * against a stray list of thumbnails or advertisement slots.
 */
export function pagesFromScripts(html: string, base: string): ChapterImage[] {
  let best: ChapterImage[] = [];

  const scripts = /<script\b[^>]*>([\s\S]*?)<\/script>/giu;
  let block: RegExpExecArray | null;

  while ((block = scripts.exec(html)) !== null) {
    const body = block[1] ?? '';
    // Any bracketed run of quoted strings. Bounded so a minified bundle
    // cannot send the regex engine into a long backtrack.
    const arrays = /\[(\s*(?:"[^"\n]{4,400}"|'[^'\n]{4,400}')\s*(?:,\s*(?:"[^"\n]{4,400}"|'[^'\n]{4,400}')\s*)*),?\s*\]/gu;

    let found: RegExpExecArray | null;
    while ((found = arrays.exec(body)) !== null) {
      const items = found[1]?.match(/"[^"\n]*"|'[^'\n]*'/gu) ?? [];
      if (items.length < MIN_SCRIPT_PAGES) continue;

      const pages: ChapterImage[] = [];
      const seen = new Set<string>();
      for (const quoted of items) {
        const raw = quoted.slice(1, -1).replace(/\\\//gu, '/');
        if (!LOOKS_LIKE_IMAGE.test(raw)) continue;

        const url = absolute(raw, base);
        if (!url || seen.has(url) || FURNITURE.test(new URL(url).pathname)) continue;
        seen.add(url);
        pages.push({ url, referer: base });
      }

      // Every entry had to be an image, or this was a list of something else
      // that merely happened to contain a few.
      if (pages.length >= MIN_SCRIPT_PAGES && pages.length >= items.length * 0.8) {
        if (pages.length > best.length) best = pages;
      }
    }
  }

  return best;
}
