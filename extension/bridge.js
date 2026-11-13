'use strict';

/*
 * The only piece of the extension that touches Couchlist itself.
 *
 * It runs on the reader page and relays two things: the chapter that was
 * just sent, and page images the reader asks for one at a time. The reader
 * cannot fetch those images itself — the source refuses a request whose
 * Referer is not its own site — so every page comes back through here.
 *
 * Deliberately narrow. It answers four message types, ignores anything from
 * another window or another origin, and exposes nothing else to the page.
 */

const TAG = 'couchlist-reader-extension';

window.addEventListener('message', (event) => {
  // Only this page, in this tab, talking to itself.
  if (event.source !== window) return;
  if (event.origin !== location.origin) return;

  const request = event.data;
  if (!request || request.tag !== TAG || !request.id) return;

  const reply = (payload) =>
    window.postMessage({ tag: TAG, id: request.id, reply: true, ...payload }, location.origin);

  if (request.type === 'ping') {
    reply({ ok: true, version: chrome.runtime.getManifest().version });
    return;
  }

  if (request.type === 'take-chapter') {
    chrome.runtime.sendMessage({ type: 'take-chapter', key: request.key }, (response) => {
      reply(
        chrome.runtime.lastError
          ? { ok: false, error: 'The Couchlist extension is not responding.' }
          : response,
      );
    });
    return;
  }

  if (request.type === 'read-url') {
    chrome.runtime.sendMessage({ type: 'read-url', url: request.url }, (response) => {
      reply(
        chrome.runtime.lastError
          ? { ok: false, error: 'The Couchlist extension is not responding.' }
          : response,
      );
    });
    return;
  }

  if (request.type === 'page') {
    chrome.runtime.sendMessage(
      { type: 'page', url: request.url, referer: request.referer },
      (response) => {
        reply(
          chrome.runtime.lastError
            ? { ok: false, error: 'The Couchlist extension is not responding.' }
            : response,
        );
      },
    );
  }
});

/*
 * Announce the extension so the reader can show the right thing before
 * anybody presses a button: with it, "pages load through the extension";
 * without it, an honest explanation of why a chapter link cannot be read.
 */
window.postMessage(
  { tag: TAG, ready: true, version: chrome.runtime.getManifest().version },
  location.origin,
);
