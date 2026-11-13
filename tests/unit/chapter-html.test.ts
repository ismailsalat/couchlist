import { describe, expect, it } from 'vitest';
import { extractChapter } from '@couchlist/shared';

/**
 * Built from the shapes the desktop reader documented hitting on real sites,
 * because those are the cases a naive extractor gets wrong.
 */
const BASE = 'https://site.test/manga/title/chapter-50';

describe('extracting a chapter from HTML', () => {
  it('prefers the reader container over everything else on the page', () => {
    const html = `
      <header><img src="/logo.png" alt="Logo"></header>
      <nav><img src="/nav/icon.png"></nav>
      <div class="reading-content">
        <img src="https://cdn.test/1.jpg">
        <img src="https://cdn.test/2.jpg">
      </div>
      <aside><img src="/ads/banner.jpg"></aside>`;

    const result = extractChapter(html, BASE);
    expect(result.pages.map((page) => page.url)).toEqual([
      'https://cdn.test/1.jpg',
      'https://cdn.test/2.jpg',
    ]);
    // Found properly, so the reader must not warn about guessing.
    expect(result.guessed).toBe(false);
  });

  it('reads lazy-loaded pages and ignores the placeholder', () => {
    // MangaKatana ships src="#" until the page is scrolled into view.
    const html = `<div id="imgs">
      <img src="#" data-src="https://cdn.test/1.jpg">
      <img src="/spinner.gif" data-lazy-src="https://cdn.test/2.jpg">
      <img data-original="https://cdn.test/3.jpg">
    </div>`;

    expect(extractChapter(html, BASE).pages.map((page) => page.url)).toEqual([
      'https://cdn.test/1.jpg',
      'https://cdn.test/2.jpg',
      'https://cdn.test/3.jpg',
    ]);
  });

  it('honours each image referrerpolicy separately', () => {
    // The Zaza case: the full chapter URL is refused, the bare origin is not.
    const html = `<div class="reading-content">
      <img src="https://cdn.test/1.jpg" referrerpolicy="origin">
      <img src="https://cdn.test/2.jpg" referrerpolicy="no-referrer">
      <img src="https://cdn.test/3.jpg">
    </div>`;

    const pages = extractChapter(html, BASE).pages;
    expect(pages[0]!.referer).toBe('https://site.test/');
    expect(pages[1]!.referer).toBe('');
    expect(pages[2]!.referer).toBe(BASE);
  });

  it('falls back to loose images but says it is guessing', () => {
    const html = '<body><img src="https://cdn.test/1.jpg"><img src="https://cdn.test/2.jpg"></body>';
    const result = extractChapter(html, BASE);
    expect(result.pages).toHaveLength(2);
    expect(result.guessed).toBe(true);
  });

  it('drops furniture, icons and duplicates', () => {
    const html = `<div class="reading-content">
      <img src="https://cdn.test/1.jpg">
      <img src="https://cdn.test/1.jpg">
      <img src="https://cdn.test/avatar/me.png">
      <img src="https://cdn.test/arrow.svg">
      <img class="site-logo" src="https://cdn.test/x.png">
    </div>`;
    expect(extractChapter(html, BASE).pages.map((page) => page.url)).toEqual([
      'https://cdn.test/1.jpg',
    ]);
  });

  it('never returns a javascript: or data: source', () => {
    const html = `<div class="reading-content">
      <img src="javascript:alert(1)">
      <img src="data:image/png;base64,AAAA">
      <img src="https://cdn.test/ok.jpg">
    </div>`;
    expect(extractChapter(html, BASE).pages.map((page) => page.url)).toEqual([
      'https://cdn.test/ok.jpg',
    ]);
  });

  it('collects chapter links from anchors and from a select menu', () => {
    const html = `
      <a href="/manga/title/chapter-51">Chapter 51</a>
      <select>
        <option value="/manga/title/chapter-49">Chapter 49</option>
        <option value="/manga/title/chapter-50">Chapter 50</option>
      </select>`;
    const links = extractChapter(html, BASE).links;
    expect(links.map((link) => link.label)).toEqual(['Chapter 51', 'Chapter 49', 'Chapter 50']);
  });

  it('takes a title and survives rubbish input', () => {
    expect(extractChapter('<h1>Chapter 50 — The Return</h1>', BASE).title).toContain('Chapter 50');
    expect(extractChapter('', BASE).pages).toEqual([]);
    expect(extractChapter('<img', BASE).pages).toEqual([]);
  });
});

describe('pages that only exist in a script', () => {
  /*
   * MangaKatana, as documented in the desktop reader: every <img> carries
   * data-src="#" and the real ordered addresses are in `var thzq = [...]`.
   * Reading only the markup finds nothing at all.
   */
  const KATANA = 'https://mangakatana.com/manga/magic-academys-genius-blinker.27322/c2';

  const katanaHtml = `<!doctype html><html><body>
    <div id="imgs">
      <img src="#" data-src="#"><img src="#" data-src="#"><img src="#" data-src="#">
    </div>
    <script>
      var ta = 'x';
      var thzq = ['https://cdn.katana.test/a/1.jpg','https://cdn.katana.test/a/2.jpg','https://cdn.katana.test/a/3.jpg','https://cdn.katana.test/a/4.jpg'];
      function lazy(){}
    </script>
  </body></html>`;

  it('finds the pages MangaKatana hides in its script', () => {
    const result = extractChapter(katanaHtml, KATANA);
    expect(result.pages.map((page) => page.url)).toEqual([
      'https://cdn.katana.test/a/1.jpg',
      'https://cdn.katana.test/a/2.jpg',
      'https://cdn.katana.test/a/3.jpg',
      'https://cdn.katana.test/a/4.jpg',
    ]);
    // A list the page states outright is not a guess.
    expect(result.guessed).toBe(false);
  });

  it('keeps the script order, which is the reading order', () => {
    const html = `<script>var p=["https://c.test/10.jpg","https://c.test/2.jpg","https://c.test/1.jpg"];</script>`;
    expect(extractChapter(html, KATANA).pages.map((page) => page.url)).toEqual([
      'https://c.test/10.jpg',
      'https://c.test/2.jpg',
      'https://c.test/1.jpg',
    ]);
  });

  it('prefers real markup over a script when the page has both', () => {
    const html = `
      <div class="reading-content"><img src="https://cdn.test/real-1.jpg"><img src="https://cdn.test/real-2.jpg"><img src="https://cdn.test/real-3.jpg"></div>
      <script>var decoy=["https://cdn.test/thumb-1.jpg","https://cdn.test/thumb-2.jpg","https://cdn.test/thumb-3.jpg","https://cdn.test/thumb-4.jpg"];</script>`;
    expect(extractChapter(html, KATANA).pages[0]!.url).toContain('real-1');
  });

  it('ignores arrays that are not image lists', () => {
    const html = `<script>
      var nav = ["/home","/browse","/latest","/random"];
      var words = ["hello","there","friend","again"];
    </script>`;
    expect(extractChapter(html, KATANA).pages).toEqual([]);
  });

  it('ignores a short array, which is more likely decoration', () => {
    const html = `<script>var a=["https://c.test/1.jpg","https://c.test/2.jpg"];</script>`;
    expect(extractChapter(html, KATANA).pages).toEqual([]);
  });

  it('never lets a script smuggle in a dangerous URL', () => {
    const html = `<script>var p=["javascript:alert(1)","https://c.test/1.jpg","https://c.test/2.jpg","https://c.test/3.jpg"];</script>`;
    const pages = extractChapter(html, KATANA).pages;
    // The javascript: entry is dropped, and because the list is then not
    // overwhelmingly images, the whole array is rejected as a page list.
    expect(pages.every((page) => page.url.startsWith('https://'))).toBe(true);
  });

  it('takes the longest list when a page has several', () => {
    const html = `<script>
      var thumbs=["https://c.test/t1.jpg","https://c.test/t2.jpg","https://c.test/t3.jpg"];
      var pages=["https://c.test/p1.jpg","https://c.test/p2.jpg","https://c.test/p3.jpg","https://c.test/p4.jpg","https://c.test/p5.jpg"];
    </script>`;
    expect(extractChapter(html, KATANA).pages).toHaveLength(5);
  });

  it('handles escaped slashes, as JSON-encoded HTML produces', () => {
    const html = `<script>var p=["https:\\/\\/c.test\\/1.jpg","https:\\/\\/c.test\\/2.jpg","https:\\/\\/c.test\\/3.jpg"];</script>`;
    expect(extractChapter(html, KATANA).pages[0]!.url).toBe('https://c.test/1.jpg');
  });
});
