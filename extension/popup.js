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
/** Set when a chapter is collected but its image server is not allowed yet. */
let pending = null;

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

  /*
   * A chapter opened from a pasted link may be waiting on access to its
   * image server. The reader cannot ask for that — only this popup can, and
   * only from a click — so it is offered here.
   */
  chrome.runtime.sendMessage({ type: 'pending-hosts' }, (reply) => {
    if (chrome.runtime.lastError || !reply?.hosts?.length) return;
    const hosts = reply.hosts;
    $('grant').hidden = false;
    $('grant').textContent = `Allow images from ${hosts.length === 1 ? hosts[0] : `${hosts.length} servers`}`;
    $('grant').onclick = async () => {
      $('grant').disabled = true;
      try {
        const origins = hosts.map((host) => `https://${host}/*`);
        if (await chrome.permissions.request({ origins })) {
          chrome.runtime.sendMessage({ type: 'clear-pending' });
          say('Done. Go back to Couchlist and press Try this page again.');
          $('grant').hidden = true;
        } else {
          say('Those pages cannot load without that.');
        }
      } finally {
        $('grant').disabled = false;
      }
    };
  });
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
     * Ask for this site FIRST, before anything is awaited.
     *
     * Chrome only grants permissions while a click is still being handled,
     * and the first `await` spends it. Reading the page and then asking
     * therefore fails silently — the dialog never appears, and the reader
     * later reports that it cannot read the images, with nothing having
     * asked the person anything. That is the bug this ordering exists to
     * avoid, so nothing may be awaited above this line.
     *
     * It also covers the common case in one step: most sources serve their
     * pages from the same domain as the chapter.
     */
    const host = new URL(tab.url).hostname;
    const origin = `https://${host}/*`;
    if (!(await chrome.permissions.contains({ origins: [origin] }))) {
      if (!(await chrome.permissions.request({ origins: [origin] }))) {
        say('Couchlist needs access to this site to read the chapter.');
        return;
      }
    }

    say('Looking for pages…');
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['collect.js'],
    });
    const chapter = result?.result;

    if (!chapter || !chapter.pages?.length) {
      say(
        "Couldn't find any pages here. Scroll down the chapter once, then try again. A few sites draw their pages in a way nothing can read.",
      );
      return;
    }

    const needed = await missingOrigins(originsOf(chapter.pages.map((page) => page.url)));
    if (needed.length === 0) {
      await handOver(chapter);
      return;
    }

    /*
     * The pages are on another server. Asking for it needs a fresh click,
     * because the one that opened this has been spent — hence a button
     * rather than another dialog straight away.
     */
    pending = { chapter, origins: needed };
    const names = needed.map((o) => o.replace(/^https:\/\//, '').replace(/\/\*$/, ''));
    say(`Found ${chapter.pages.length} pages, stored on ${names.join(', ')}.`);
    $('grant').hidden = false;
    $('grant').textContent = `Allow ${names.length === 1 ? names[0] : `${names.length} servers`}`;
    $('grant').onclick = async () => {
      $('grant').disabled = true;
      try {
        if (await chrome.permissions.request({ origins: pending.origins })) {
          await handOver(pending.chapter);
        } else {
          say('Those pages cannot load without that.');
        }
      } finally {
        $('grant').disabled = false;
      }
    };
    $('send').hidden = true;
  } catch (error) {
    say(error?.message || 'Something went wrong. Try again.');
  } finally {
    $('send').disabled = false;
  }
});
