'use strict';

/*
 * The whole extension, in one file.
 *
 * It does one thing: read the chapter in the tab you are looking at and hand
 * it to your Couchlist reader. No background session, no stored history; the
 * worker exists only to fetch page images, which a web page is not allowed to
 * do for itself.
 *
 * Access is asked for per site, from a real click. Note that a chapter almost
 * always needs TWO sites: the page itself, and whichever server its images
 * are on. Manga sites nearly all serve pages from a separate CDN domain, and
 * asking only for the page — which this did at first — gets the page fine and
 * then fails every single image with "Failed to fetch".
 */

const DEFAULT_SITE = 'https://couchlist.io';
const $ = (id) => document.getElementById(id);

let tab = null;

function say(message) {
  $('status').textContent = message;
}

async function site() {
  const stored = await chrome.storage.local.get('site');
  return stored.site || DEFAULT_SITE;
}

/** The distinct https origins a list of URLs needs permission for. */
function originsOf(urls) {
  const origins = new Set();
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') origins.add(`https://${parsed.hostname}/*`);
    } catch {
      /* skip anything unparseable */
    }
  }
  return [...origins];
}

async function missingOrigins(origins) {
  const missing = [];
  for (const origin of origins) {
    // Checked one at a time so the list we show names exactly what is needed.
    if (!(await chrome.permissions.contains({ origins: [origin] }))) missing.push(origin);
  }
  return missing;
}

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('site').value = await site();

  if (!tab?.url || !/^https?:/i.test(tab.url)) {
    $('where').textContent = 'Open a chapter in a tab, then click this again.';
    return;
  }

  $('where').textContent = new URL(tab.url).hostname;
  $('send').disabled = false;
})();

$('site').addEventListener('change', () => {
  try {
    const url = new URL($('site').value.trim());
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      say('That address must use https://');
      return;
    }
    chrome.storage.local.set({ site: url.origin });
    say('Saved.');
  } catch {
    say('That is not a valid address.');
  }
});

/** Put the chapter where the reader can collect it, and open the reader. */
async function handOver(chapter) {
  const base = await site();
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await chrome.runtime.sendMessage({ type: 'store-chapter', key, chapter });
  await chrome.tabs.create({ url: `${base}/tools/comics#sent=${key}` });
  window.close();
}

$('send').addEventListener('click', async () => {
  $('send').disabled = true;
  try {
    /*
     * No permission prompt to read the page.
     *
     * `activeTab` already grants access to the tab you are looking at for as
     * long as it takes to answer your click — that is exactly what it is
     * for. Asking for the page host as well produced two dialogs for one
     * action, which is bewildering and buys nothing.
     *
     * The images are the part that genuinely needs asking about, because
     * they are nearly always on a different server, and only now — having
     * read the page — can we say which one.
     */
    say('Reading the page…');
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['collect.js'],
    });
    const chapter = result?.result;

    if (!chapter || !chapter.pages?.length) {
      say(
        'No chapter images found. Let the chapter finish loading in its tab and try again — some readers draw pages onto a canvas, which cannot be read this way.',
      );
      return;
    }

    const needed = await missingOrigins(originsOf(chapter.pages.map((page) => page.url)));
    if (needed.length === 0) {
      await handOver(chapter);
      return;
    }

    /*
     * Asked for in one prompt covering every image host at once, rather than
     * one dialog per server.
     */
    const names = needed.map((origin) => origin.replace(/^https:\/\//, '').replace(/\/\*$/, ''));
    say(`Allow Couchlist to read the ${chapter.pages.length} pages from ${names.join(', ')}.`);
    if (!(await chrome.permissions.request({ origins: needed }))) {
      say('Without access to the image server the pages cannot be loaded.');
      return;
    }
    await handOver(chapter);
  } catch (error) {
    say(error?.message || 'Something went wrong reading that page.');
  } finally {
    $('send').disabled = false;
  }
});
