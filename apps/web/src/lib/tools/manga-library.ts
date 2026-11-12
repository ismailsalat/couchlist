'use client';

import {
  imageEntries,
  imageExtension,
  readArchiveEntry,
  readArchiveIndex,
  type ArchiveEntry,
} from '@couchlist/shared';

/**
 * The reader's model of what you have imported.
 *
 * The rule that shapes all of this: **pages are decoded on demand and never
 * all at once**. A forty-chapter import is hundreds of megabytes; turning
 * every page into an object URL up front locks the tab and, on a phone, gets
 * the page killed outright. So a chapter holds its archive bytes once, and a
 * page becomes a URL only when it is about to be looked at.
 */

export type PageSource =
  | { kind: 'archive'; entry: ArchiveEntry }
  | { kind: 'loose'; bytes: Uint8Array }
  /**
   * A page that lives on somebody else's server.
   *
   * The browser fetches it as an ordinary image, which is why this works at
   * all without a proxy: an <img> may load cross-origin even where fetch()
   * would be refused. The consequence is that we never hold its bytes, so a
   * remote chapter cannot be exported to .cbz and its URL is handed to the
   * cache as-is rather than becoming an object URL to revoke.
   */
  | { kind: 'remote'; url: string }
  /**
   * A page from a source site, fetched by the extension.
   *
   * Separate from `remote` because it cannot be loaded directly: these CDNs
   * refuse any request whose Referer is not their own site, so an <img>
   * pointing at one returns 403 and renders as a broken page. The extension
   * fetches it with the right Referer and hands back a data URL.
   */
  | { kind: 'sourced'; url: string; referer: string };

export interface Chapter {
  id: string;
  name: string;
  /** The archive, held once. Absent for chapters built from loose images. */
  bytes?: Uint8Array;
  pages: PageSource[];
  /** Reordering edits this; export and reading both follow it. */
  order: number[];
}

/** The browser can inflate without a library; this is the whole adapter. */
export async function inflateRaw(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([input as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function chapterPageCount(chapter: Chapter): number {
  return chapter.order.length;
}

/** The bytes of one page, decompressing it if it lives in an archive. */
export async function pageBytes(chapter: Chapter, index: number): Promise<Uint8Array> {
  const source = chapter.pages[chapter.order[index] ?? index];
  if (!source) throw new Error('No such page.');
  if (source.kind === 'remote' || source.kind === 'sourced') {
    // Reading one works; having its bytes does not.
    throw new Error('That page is a web link, so its file is not on your device.');
  }
  if (source.kind === 'loose') return source.bytes;
  if (!chapter.bytes) throw new Error('That chapter is missing its file.');
  return readArchiveEntry(chapter.bytes, source.entry, inflateRaw);
}

/**
 * A small cache of decoded pages.
 *
 * Object URLs hold their blob in memory until revoked, so an unbounded cache
 * is a memory leak with extra steps. This keeps a window around where you are
 * reading and revokes everything else.
 */
export class PageCache {
  private readonly urls = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string>>();

  constructor(private readonly limit = 14) {}

  key(chapterId: string, index: number): string {
    return `${chapterId}:${index}`;
  }

  peek(chapterId: string, index: number): string | undefined {
    return this.urls.get(this.key(chapterId, index));
  }

  /** Whether any page of this chapter is a web link rather than a file. */
  static isRemote(chapter: Chapter): boolean {
    return chapter.pages.some((page) => page.kind === 'remote' || page.kind === 'sourced');
  }

  async get(chapter: Chapter, index: number): Promise<string> {
    const key = this.key(chapter.id, index);

    const existing = this.urls.get(key);
    if (existing) {
      // Touch it, so the window follows the reader.
      this.urls.delete(key);
      this.urls.set(key, existing);
      return existing;
    }

    /*
     * A remote page is already a URL. Returning it directly keeps it out of
     * the object-URL map entirely, so eviction never tries to revoke a link
     * it does not own — and a remote chapter costs no memory to hold open.
     */
    const source = chapter.pages[chapter.order[index] ?? index];
    if (source?.kind === 'remote') return source.url;

    /*
     * Routed through the extension, and cached like any other page so a
     * reread does not fetch it twice. The data URL is not an object URL, so
     * eviction has nothing to revoke — it is simply dropped.
     */
    if (source?.kind === 'sourced') {
      const pending = this.pending.get(key);
      if (pending) return pending;

      const work = (async () => {
        const { fetchPageThroughExtension } = await import('./reader-bridge');
        const dataUrl = await fetchPageThroughExtension(source.url, source.referer);
        this.urls.set(key, dataUrl);
        this.evict();
        return dataUrl;
      })();

      this.pending.set(key, work);
      try {
        return await work;
      } finally {
        this.pending.delete(key);
      }
    }

    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const work = (async () => {
      const bytes = await pageBytes(chapter, index);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
      this.urls.set(key, url);
      this.pending.delete(key);
      this.evict();
      return url;
    })();

    this.pending.set(key, work);
    return work;
  }

  /*
   * Only an object URL has anything to release. A data URL from the
   * extension is an ordinary string, and handing one to revokeObjectURL is
   * at best a no-op — so the check is about saying what we mean, and about
   * not pretending to free memory we never allocated.
   */
  private static release(url: string | undefined): void {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  private evict(): void {
    while (this.urls.size > this.limit) {
      const oldest = this.urls.keys().next().value as string | undefined;
      if (!oldest) break;
      const url = this.urls.get(oldest);
      this.urls.delete(oldest);
      PageCache.release(url);
    }
  }

  clear(): void {
    for (const url of this.urls.values()) PageCache.release(url);
    this.urls.clear();
    this.pending.clear();
  }
}

/* ------------------------------------------------------------- importing */

const ARCHIVE_PATTERN = /\.(cbz|zip)$/iu;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `ch_${Date.now().toString(36)}_${counter}`;
}

export interface ImportResult {
  chapters: Chapter[];
  /** Files we could not use, with the reason, so nothing vanishes silently. */
  rejected: Array<{ name: string; reason: string }>;
}

/**
 * Turn dropped files into chapters.
 *
 * Archives become one chapter each. Loose images are gathered into a single
 * chapter, because that is what dropping a folder of pages means.
 */
export async function importFiles(files: readonly File[]): Promise<ImportResult> {
  const chapters: Chapter[] = [];
  const rejected: ImportResult['rejected'] = [];
  const loose: Array<{ name: string; bytes: Uint8Array }> = [];

  for (const file of files) {
    try {
      if (ARCHIVE_PATTERN.test(file.name)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pages = imageEntries(readArchiveIndex(bytes));
        if (pages.length === 0) {
          rejected.push({ name: file.name, reason: 'No images inside' });
          continue;
        }
        chapters.push({
          id: nextId(),
          name: file.name.replace(ARCHIVE_PATTERN, ''),
          bytes,
          pages: pages.map((entry) => ({ kind: 'archive', entry })),
          order: pages.map((_, index) => index),
        });
        continue;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!imageExtension(bytes)) {
        rejected.push({ name: file.name, reason: 'Not an image or an archive' });
        continue;
      }
      loose.push({ name: file.name, bytes });
    } catch (error) {
      rejected.push({ name: file.name, reason: (error as Error)?.message ?? 'Could not read it' });
    }
  }

  if (loose.length > 0) {
    loose.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    chapters.push({
      id: nextId(),
      name: commonName(loose.map((image) => image.name)) || 'Imported pages',
      pages: loose.map((image) => ({ kind: 'loose', bytes: image.bytes })),
      order: loose.map((_, index) => index),
    });
  }

  // Chapter 2 before chapter 10, as a person would expect.
  chapters.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { chapters, rejected };
}

/** A sensible name for a pile of loose pages: their shared prefix, if any. */
export function commonName(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!.replace(/\.[^.]+$/u, '');

  let prefix = names[0]!;
  for (const name of names.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < name.length && prefix[index] === name[index]) index += 1;
    prefix = prefix.slice(0, index);
  }
  return prefix.replace(/[\s._-]+$/u, '').trim();
}

/* -------------------------------------------------------------- progress */

const PROGRESS_KEY = 'couchlist.reader.progress';

/**
 * Where you had got to.
 *
 * Kept per chapter name rather than per import, so closing the tab and
 * dropping the same file in tomorrow puts you back where you were. Stored in
 * this browser only: nothing about what you read leaves the machine.
 */
export function loadProgress(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function saveProgress(name: string, page: number): void {
  try {
    const all = loadProgress();
    all[name] = page;
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    // Private browsing refuses storage. Reading still works.
  }
}
