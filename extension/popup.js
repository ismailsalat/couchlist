'use strict';

/*
 * The whole extension, in one file.
 *
 * It does exactly one thing: read the chapter in the tab you are looking at
 * and hand it to your Couchlist reader. There is no background worker, no
 * stored session and no fetching of images by the extension — the reader
 * loads those itself, straight from their own server.
 *
 * Access is requested per site, from a real click, because Chrome only allows
 * it from a user gesture and because asking for every website up front is how
 * a reading tool ends up with more power than it needs.
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

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('site').value = await site();

  if (!tab?.url || !/^https?:/i.test(tab.url)) {
    $('where').textContent = 'Open a chapter in a tab, then click this again.';
    return;
  }

  const host = new URL(tab.url).hostname;
  $('where').textContent = host;
  $('send').disabled = false;

  // Tell them up front whether a permission prompt is coming.
  const granted = await chrome.permissions.contains({ origins: [`https://${host}/*`] });
  if (!granted) say('You will be asked to allow access to this site.');
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

$('send').addEventListener('click', async () => {
  $('send').disabled = true;
  try {
    const host = new URL(tab.url).hostname;
    const granted = await chrome.permissions.request({ origins: [`https://${host}/*`] });
    if (!granted) {
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
     * Handed to the worker under a one-time key, and the key goes in the URL
     * fragment. The chapter itself used to travel in the fragment, which
     * capped it at what a URL can hold; a key is a dozen characters however
     * long the chapter is, and a fragment still never reaches a server.
     */
    const base = await site();
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await chrome.runtime.sendMessage({ type: 'store-chapter', key, chapter });
    await chrome.tabs.create({ url: `${base}/tools/comics#sent=${key}` });
    window.close();
  } catch (error) {
    say(error?.message || 'Something went wrong reading that page.');
  } finally {
    $('send').disabled = false;
  }
});
