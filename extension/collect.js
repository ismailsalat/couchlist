/*
 * Runs in the tab you already have open, reads what is rendered, and returns
 * plain data. Nothing is evaluated from the page, and no HTML or script from
 * the source comes back with it — only image URLs and link URLs. That is what
 * keeps the source's ads out of the reader.
 */
(() => {
  const SELECTORS = {
    'mangakatana.com': ['#imgs img'],
    'zazamanga.com': ['img.wp-manga-chapter-img'],
    'weebcentral.com': ['section[id*="image"] img', 'img[alt*="Page"]'],
    'asurascans.com': ['img[alt^="Page "]'],
    'mangafire.to': ['[class*="reader"] img', 'img[alt*="Page"]'],
    'manhwaz.cc': ['.reading-content img', '#readerarea img', '.entry-content img'],
  };
  // Tried after a site-specific rule, before falling back to image size.
  const GENERIC = [
    '.reading-content img',
    '.reader-area img',
    '.chapter-content img',
    '.chapter-images img',
    '#imgs img',
    '#readerarea img',
    '#chapter_imgs img',
    '.container-chapter-reader img',
    '.page-break img',
    '.entry-content img',
    '[class*="reader"] img',
    '[id*="reader"] img',
  ];

  const host = location.hostname.replace(/^www\./, '');

  function absolute(value) {
    if (!value || value.startsWith('#') || value.startsWith('data:') || value.startsWith('blob:')) {
      return null;
    }
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      if (/\.(svg|ico)(?:\?|$)/i.test(url.pathname)) return null;

      /*
       * A placeholder of "#" resolves to the page itself.
       *
       * `img.currentSrc` for `<img src="#">` is the chapter's own URL, not
       * nothing — so without this, four placeholder tags read as four
       * perfectly good pages, the markup looks successful, and the script
       * holding the real addresses is never consulted. That is precisely
       * how MangaKatana returned one page instead of its chapter.
       */
      const here = new URL(location.href);
      if (url.origin === here.origin && url.pathname === here.pathname && url.search === here.search) {
        return null;
      }
      return url.toString();
    } catch {
      return null;
    }
  }

  /*
   * Lazy-loaded pages keep the real address in a data attribute until shown.
   * The list is long because every lazy-loading library picked its own name,
   * and a page whose attribute is not listed reads as an empty chapter.
   */
  const LAZY_ATTRIBUTES = [
    'data-src',
    'data-lazy-src',
    'data-original',
    'data-url',
    'data-image',
    'data-echo',
    'data-full',
    'data-large',
    'data-cfsrc',
    'data-aload',
  ];

  function sourceOf(img) {
    const candidates = [img.currentSrc];
    for (const name of LAZY_ATTRIBUTES) candidates.push(img.getAttribute(name));
    candidates.push(img.getAttribute('src'));

    // A srcset lists widths; the last entry is the largest.
    for (const name of ['data-srcset', 'srcset']) {
      const set = img.getAttribute(name);
      if (set) candidates.push(set.split(',').pop().trim().split(/\s+/)[0]);
    }

    for (const value of candidates) {
      const found = absolute(value);
      if (found && !/placeholder|loading\.gif|spinner/i.test(found)) return found;
    }
    return null;
  }

  function images() {
    for (const selector of [...(SELECTORS[host] || []), ...GENERIC]) {
      const found = [...document.querySelectorAll(selector)];
      if (found.some(sourceOf)) return { nodes: found, guessed: false };
    }
    /*
     * Last resort: anything big enough to be a comic page and not sitting in
     * the furniture. Reported as guessed so the reader can warn that the
     * order may be wrong and unrelated images may have come along.
     */
    /*
     * Last resort, and it must not judge by rendered size alone.
     *
     * A chapter you have not scrolled through yet has every page still
     * lazy-loaded: `naturalWidth` is 0 because no image has been fetched,
     * so a size test rejects the entire chapter and the extension reports
     * finding nothing on a page visibly full of pages. An image that names
     * a real address in a lazy attribute is a page whether or not the
     * browser has got round to loading it.
     */
    const lazy = ['data-src', 'data-lazy-src', 'data-original', 'data-url', 'data-image'];
    return {
      nodes: [...document.images].filter((img) => {
        if (img.closest('header,footer,nav,aside,[class*="ad"],[class*="banner"]')) return false;
        if (lazy.some((name) => (img.getAttribute(name) || '').trim().length > 1)) return true;
        // Fall back to the declared size when nothing has rendered yet.
        const width = img.naturalWidth || Number(img.getAttribute('width')) || 0;
        const height = img.naturalHeight || Number(img.getAttribute('height')) || 0;
        return width >= 400 && height >= 500;
      }),
      guessed: true,
    };
  }

  function links() {
    const out = [];
    let previous = null;
    let next = null;

    for (const anchor of document.querySelectorAll('a[href]')) {
      const href = absolute(anchor.getAttribute('href'));
      if (!href) continue;
      try {
        if (new URL(href).hostname !== location.hostname) continue;
      } catch {
        continue;
      }

      const words = `${anchor.textContent || ''} ${anchor.className} ${anchor.id} ${anchor.rel}`
        .toLowerCase()
        .replace(/[_-]/g, ' ');
      const disabled = anchor.matches('[disabled],[aria-disabled="true"],.disabled');
      if (!disabled) {
        if (!previous && /\b(prev|previous)\b/.test(words)) previous = href;
        if (!next && /\bnext\b/.test(words)) next = href;
      }
      out.push({ url: href, label: (anchor.textContent || '').trim().slice(0, 200) });
    }

    // Many readers put the chapter list in a <select> rather than in links.
    for (const option of document.querySelectorAll('select option[value]')) {
      const href = absolute(option.value);
      if (href) out.push({ url: href, label: (option.textContent || '').trim().slice(0, 200) });
    }

    return { previous, next, candidates: out };
  }

  /*
   * Which Referer this particular image expects.
   *
   * Not a detail. A CDN that wants its own site as the Referer will answer
   * 403 to the wrong form of it, and the two forms are not interchangeable:
   * `referrerpolicy="origin"` means the image is served only when the
   * Referer is the bare origin, and sending the full chapter URL instead
   * fails. The page already states what it needs on each tag, so read it
   * rather than guessing one value for the whole chapter.
   */
  function refererFor(img) {
    const policy = (img.getAttribute('referrerpolicy') || '').toLowerCase();
    if (policy === 'no-referrer') return '';
    if (policy === 'origin' || policy === 'strict-origin' || policy === 'origin-when-cross-origin') {
      return location.origin + '/';
    }
    return location.href;
  }

  /*
   * Pages that live in a script rather than in the markup.
   *
   * MangaKatana is the clearest case: every <img> holds data-src="#" and
   * the real ordered addresses sit in a JavaScript array the page fills in
   * later. Read only the tags and a chapter looks empty.
   *
   * The arrays are read by pattern, never executed. Running a source's own
   * code to find its images would hand the page control of the collector.
   */
  function fromScripts() {
    let best = [];
    for (const script of document.querySelectorAll('script:not([src])')) {
      const body = script.textContent || '';
      if (body.length > 600000) continue;

      const arrays = body.match(
        /\[\s*(?:"[^"\n]{4,400}"|'[^'\n]{4,400}')\s*(?:,\s*(?:"[^"\n]{4,400}"|'[^'\n]{4,400}')\s*)*,?\s*\]/g,
      );
      for (const text of arrays || []) {
        const items = text.match(/"[^"\n]*"|'[^'\n]*'/g) || [];
        if (items.length < 3) continue;

        const urls = [];
        for (const quoted of items) {
          const raw = quoted.slice(1, -1).replace(/\\\//g, '/');
          if (!/\.(?:png|jpe?g|webp|avif|gif|bmp)(?:[?#]|$)/i.test(raw)) continue;
          const url = absolute(raw);
          if (url && !urls.includes(url)) urls.push(url);
        }
        // Must be overwhelmingly images, or it was a list of something else.
        if (urls.length >= 3 && urls.length >= items.length * 0.8 && urls.length > best.length) {
          best = urls;
        }
      }
    }
    return best;
  }

  /*
   * Readers that do not use <img> at all.
   *
   * Some paint pages as CSS backgrounds on divs, and some wrap them in
   * <picture> with the real address only on a <source>. Neither appears in
   * document.images, so without these a chapter looks empty.
   */
  function fromBackgrounds() {
    const found = [];
    for (const node of document.querySelectorAll('[style*="background"]')) {
      const match = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(node.getAttribute('style') || '');
      const url = match && absolute(match[1]);
      if (url && !found.includes(url)) found.push(url);
    }
    return found;
  }

  function fromPictures() {
    const found = [];
    for (const source of document.querySelectorAll('picture source[srcset], picture source[data-srcset]')) {
      const set = source.getAttribute('data-srcset') || source.getAttribute('srcset') || '';
      const first = set.split(',').pop().trim().split(/\s+/)[0];
      const url = absolute(first);
      if (url && !found.includes(url)) found.push(url);
    }
    return found;
  }

  const scan = images();
  const pages = [];
  const seen = new Set();

  /*
   * Tried when the markup yields nothing usable. Checked before giving up
   * rather than before looking, because where a page does put its images in
   * tags, the tags carry the referrer policy and the alt text too.
   */
  const usable = scan.nodes.filter(sourceOf).length;
  if (usable === 0) {
    /*
     * Tried in order of how deliberate each is: a script list is the site
     * stating its pages outright, a <picture> is still real markup, and a
     * CSS background is the vaguest of the three.
     */
    let fallback = [];
    for (const strategy of [fromScripts, fromPictures, fromBackgrounds]) {
      fallback = strategy();
      if (fallback.length >= 3) break;
    }

    for (const url of fallback) {
      pages.push({ url, label: `Page ${pages.length + 1}`, referer: location.href });
    }
  }

  for (const img of scan.nodes) {
    const url = sourceOf(img);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    pages.push({
      url,
      label: img.alt || `Page ${pages.length + 1}`,
      referer: refererFor(img),
    });
  }

  return {
    version: 1,
    // A script list is as deliberate as markup, so it is not a guess.
    title: (document.querySelector('h1')?.textContent || document.title || 'Chapter').trim().slice(0, 250),
    sourceUrl: location.href,
    pages: pages.slice(0, 1500),
    guessed: scan.guessed && pages.length > 0 && usable > 0,
    ...links(),
  };
})();
