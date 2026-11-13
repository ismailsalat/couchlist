import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractChapter, parseExternalUrl, seriesChapters } from '@couchlist/shared';
import { createLogger } from '@couchlist/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = createLogger({ service: 'chapter-read' });

/**
 * Reading a chapter page so the browser does not have to.
 *
 * This exists because a web page cannot fetch another site's HTML — the
 * browser refuses cross-origin — and asking everybody to install an
 * extension before they can paste a link is a poor trade.
 *
 * The line this deliberately does not cross: **only the HTML is fetched
 * here, never the images.** The page addresses are handed back and the
 * reader loads the images straight from their own server, so Couchlist
 * never receives, stores or re-serves a single page of anybody's comic.
 * That keeps the promise the footer makes.
 *
 * What it cannot do, and says so rather than failing silently: a source that
 * requires its own Referer on images will refuse them when they are loaded
 * from couchlist.io. That is what the extension is for. The response reports
 * whether that is likely so the reader can explain it up front.
 */
const Body = z.object({
  url: z.string().min(1).max(2048),
});

/** Bounded so a hostile or broken page cannot tie up the server. */
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: 'Send a chapter link.' } }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: 'Send a chapter link.' } }, { status: 400 });
  }

  /*
   * The same check the safety tool uses. This endpoint fetches a URL the
   * caller chose, so without it the server could be pointed at a private
   * address or a cloud metadata endpoint.
   */
  const target = parseExternalUrl(parsed.data.url);
  if (!target) {
    return NextResponse.json(
      { error: { message: 'That is not a public http:// or https:// chapter link.' } },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(target.url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'CouchlistReader/1.0 (+https://couchlist.io)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: {
            message:
              response.status === 403 || response.status === 401
                ? 'That source refused us. It may require a login, or block servers. The extension can read it in your own browser instead.'
                : `That source returned ${response.status}.`,
          },
        },
        { status: 502 },
      );
    }

    const type = response.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/iu.test(type)) {
      return NextResponse.json(
        { error: { message: 'That link is not a chapter page.' } },
        { status: 422 },
      );
    }

    // Read with a cap rather than trusting content-length.
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_HTML_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }

    const html = new TextDecoder('utf-8', { fatal: false }).decode(
      Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
    );

    const final = response.url || target.url.toString();
    const chapter = extractChapter(html, final);

    if (chapter.pages.length === 0) {
      return NextResponse.json(
        {
          error: {
            message:
              'No page images were found there. The source may build its reader with scripts, which only the extension can read.',
          },
        },
        { status: 422 },
      );
    }

    log.info('chapter_read', { host: target.url.hostname, pages: chapter.pages.length });

    return NextResponse.json({
      title: chapter.title,
      sourceUrl: final,
      pages: chapter.pages,
      chapters: seriesChapters(final, chapter.links),
      guessed: chapter.guessed,
      /*
       * A page whose images name a Referer will almost certainly refuse to
       * load from couchlist.io. Saying so up front beats a reader full of
       * broken pages and a shrug.
       */
      needsExtension: chapter.pages.some((page) => page.referer !== ''),
    });
  } catch (error) {
    const aborted = (error as Error)?.name === 'AbortError';
    return NextResponse.json(
      {
        error: {
          message: aborted
            ? 'That source took too long to answer.'
            : 'That source could not be reached.',
        },
      },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }
}
