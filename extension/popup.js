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
/** Set once a chapter is collected and still needs image-host access. */
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
    const host = new URL(tab.url).hostname;
    if (!(await chrome.permissions.request({ origins: [`https://${host}/*`] }))) {
      say('Access was not granted, so this chapter cannot be read.');
      return;
    }

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

    /*
     * The images usually live somewhere else. Permission for those hosts has
     * to be asked for separately, and it cannot be requested here: the click
     * that opened this was spent on the request above, and Chrome only grants
     * permissions during a gesture. So the hosts are named and a second
     * button asks for them — which is also the honest way round, since now
     * we can say exactly which servers are involved instead of guessing
     * before we have looked.
     */
    const needed = await missingOrigins(originsOf(chapter.pages.map((page) => page.url)));
    if (needed.length === 0) {
      await handOver(chapter);
      return;
    }

    pending = { chapter, origins: needed };
    const names = needed.map((origin) => origin.replace(/^https:\/\//, '').replace(/\/\*$/, ''));
    $('where').textContent = `${chapter.pages.length} pages · images from ${names.join(', ')}`;
    say('These pages are stored on another server. Allow it to finish.');
    $('grant').hidden = false;
    $('grant').textContent = `Allow ${names.length === 1 ? names[0] : `${names.length} image servers`}`;
    $('send').hidden = true;
  } catch (error) {
    say(error?.message || 'Something went wrong reading that page.');
  } finally {
    $('send').disabled = false;
  }
});

$('grant').addEventListener('click', async () => {
  if (!pending) return;
  $('grant').disabled = true;
  try {
    if (!(await chrome.permissions.request({ origins: pending.origins }))) {
      say('Without access to the image server the pages cannot be loaded.');
      return;
    }
    await handOver(pending.chapter);
  } catch (error) {
    say(error?.message || 'Something went wrong.');
  } finally {
    $('grant').disabled = false;
  }
});
