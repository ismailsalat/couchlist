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
  };
  // Tried after a site-specific rule, before falling back to image size.
  const GENERIC = [
    '.reading-content img',
    '.reader-area img',
    '.chapter-content img',
    '.chapter-images img',
    '#imgs img',
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
      return url.toString();
    } catch {
      return null;
    }
  }

  /* Lazy-loaded images keep the real URL in a data- attribute until shown. */
  function sourceOf(img) {
    for (const value of [
      img.currentSrc,
      img.getAttribute('data-src'),
      img.getAttribute('data-lazy-src'),
      img.getAttribute('data-original'),
      img.getAttribute('src'),
    ]) {
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
    return {
      nodes: [...document.images].filter(
        (img) =>
          img.naturalWidth >= 400 &&
          img.naturalHeight >= 500 &&
          !img.closest('header,footer,nav,aside,[class*="ad"],[class*="banner"]'),
      ),
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

  const scan = images();
  const pages = [];
  const seen = new Set();
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
    title: (document.querySelector('h1')?.textContent || document.title || 'Chapter').trim().slice(0, 250),
    sourceUrl: location.href,
    pages: pages.slice(0, 1500),
    guessed: scan.guessed,
    ...links(),
  };
})();
