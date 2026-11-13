/*
 * Couchlist page inspector.
 *
 * Paste into the browser console on a chapter page. It reports what the
 * collector would see and why it might see nothing, then copies the report
 * to the clipboard.
 *
 * It only reads the page. It sends nothing anywhere, and it deliberately
 * records hostnames and tag shapes rather than full image URLs, so a report
 * can be pasted into a chat without handing over working links.
 */
(() => {
  const report = { url: location.href, host: location.hostname, when: new Date().toISOString() };

  const CONTAINERS = [
    '#imgs', '.reading-content', '.reader-area', '.chapter-content', '.chapter-images',
    '.manga-reader', '.comic-reader', '.read-container', '.viewer-pages', '#readerarea',
    '.entry-content', '#chapter_imgs', '.page-break', '.container-chapter-reader',
  ];

  const LAZY = ['data-src', 'data-lazy-src', 'data-original', 'data-url', 'data-image', 'srcset', 'data-srcset'];

  report.totals = {
    images: document.images.length,
    canvases: document.querySelectorAll('canvas').length,
    iframes: document.querySelectorAll('iframe').length,
    // A canvas-only reader cannot be read by any extension.
    pictures: document.querySelectorAll('picture').length,
  };

  report.containers = CONTAINERS.map((selector) => {
    const node = document.querySelector(selector);
    return node ? { selector, images: node.querySelectorAll('img').length } : null;
  }).filter(Boolean);

  /* Which ancestors actually hold the big images, named by class. */
  const big = [...document.images].filter(
    (img) => (img.naturalWidth || img.width || 0) >= 300 || LAZY.some((a) => img.getAttribute(a)),
  );
  const parents = new Map();
  for (const img of big) {
    const parent = img.closest('div[class],div[id],section[class],main[class]');
    if (!parent) continue;
    const name = `${parent.tagName.toLowerCase()}${parent.id ? '#' + parent.id : ''}.${(parent.className || '').toString().split(/\s+/).slice(0, 3).join('.')}`;
    parents.set(name, (parents.get(name) ?? 0) + 1);
  }
  report.likelyContainers = [...parents.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, images: count }));

  report.bigImages = big.length;

  /* A few representative tags, with hosts instead of full addresses. */
  report.samples = big.slice(0, 6).map((img) => {
    const attrs = {};
    for (const name of ['src', ...LAZY, 'referrerpolicy', 'class', 'alt', 'loading']) {
      const value = img.getAttribute(name);
      if (!value) continue;
      let shown = value.slice(0, 120);
      if (/^https?:/i.test(value)) {
        try {
          const url = new URL(value);
          shown = `${url.hostname}${url.pathname.replace(/[^/]+$/, '…')}`;
        } catch { /* keep the truncated text */ }
      } else if (value.startsWith('data:')) {
        shown = 'data: placeholder';
      }
      attrs[name] = shown;
    }
    return {
      attrs,
      loaded: img.complete && img.naturalWidth > 0,
      natural: `${img.naturalWidth}x${img.naturalHeight}`,
      currentSrcHost: (() => {
        try { return img.currentSrc ? new URL(img.currentSrc).hostname : ''; } catch { return ''; }
      })(),
    };
  });

  /* Hosts the pages come from — the thing permissions have to cover. */
  const hosts = new Set();
  for (const img of big) {
    for (const value of [img.currentSrc, img.getAttribute('src'), ...LAZY.map((a) => img.getAttribute(a))]) {
      if (!value || !/^https?:/i.test(value)) continue;
      try { hosts.add(new URL(value).hostname); } catch { /* ignore */ }
    }
  }
  report.imageHosts = [...hosts];

  report.notes = [];
  if (report.totals.canvases > 0 && big.length === 0) {
    report.notes.push('Pages appear to be drawn onto a canvas. No extension can read those.');
  }
  if (big.length > 0 && big.every((img) => !img.complete || img.naturalWidth === 0)) {
    report.notes.push('Images are present but none have loaded yet — try scrolling the chapter first.');
  }
  if (report.totals.iframes > 0) {
    report.notes.push('The reader may live inside an iframe, which is collected separately.');
  }

  const text = JSON.stringify(report, null, 2);
  console.log(text);
  navigator.clipboard?.writeText(text).then(
    () => console.log('%cCopied. Paste it to Claude.', 'color:#8fc9c2;font-weight:bold'),
    () => console.log('%cSelect the JSON above and copy it.', 'color:#f6ba7b'),
  );
  return report;
})();
