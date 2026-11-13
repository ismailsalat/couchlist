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

/**
 * Send to the worker, surviving the ways that can fail.
 *
 * Reloading or updating the extension leaves the content scripts already
 * injected into open pages orphaned: their extension context is gone, and
 * every message throws "Could not establish connection. Receiving end does
 * not exist." Chrome says that about the plumbing; the person needs to be
 * told the page needs reloading, which is the only thing that fixes it.
 */
function toWorker(message, reply) {
  // `chrome.runtime.id` disappears when the context has been invalidated.
  if (!chrome.runtime?.id) {
    reply({ ok: false, stale: true, error: 'The Couchlist extension was updated. Reload this page.' });
    return;
  }

  try {
    chrome.runtime.sendMessage(message, (response) => {
      const failure = chrome.runtime.lastError;
      if (failure) {
        const stale = /receiving end|context invalidated|message port/iu.test(failure.message || '');
        reply({
          ok: false,
          stale,
          error: stale
            ? 'The Couchlist extension was updated. Reload this page.'
            : 'The Couchlist extension is not responding.',
        });
        return;
      }
      reply(response);
    });
  } catch {
    reply({ ok: false, stale: true, error: 'The Couchlist extension was updated. Reload this page.' });
  }
}

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
    toWorker({ type: 'take-chapter', key: request.key }, reply);
    return;
  }

  if (request.type === 'read-url') {
    toWorker({ type: 'read-url', url: request.url }, reply);
    return;
  }

  if (request.type === 'page') {
    toWorker({ type: 'page', url: request.url, referer: request.referer }, reply);
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
