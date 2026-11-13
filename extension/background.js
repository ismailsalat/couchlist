'use strict';

/*
 * Fetching the pages.
 *
 * This exists because of one stubborn fact: most manga CDNs refuse a request
 * whose Referer is not their own site. Loading `<img src="https://cdn/…">`
 * straight from couchlist.io therefore returns 403 and the reader shows a row
 * of broken images — which is exactly what happened when this worker did not
 * exist.
 *
 * Two things have to be true to get a page, and only a background worker can
 * do both. It can fetch cross-origin without CORS (a content script cannot —
 * since Chrome 85 its fetches are subject to the page's CORS rules, and these
 * CDNs send no Access-Control-Allow-Origin). And it can attach a Referer
 * header through declarativeNetRequest, which ordinary fetch options cannot
 * override.
 *
 * Pages are fetched one at a time, on request, so a 200-page chapter never
 * sits in memory at once.
 */

/* Rule IDs live in a small fixed range we own and clear on startup. */
const RULE_ID = 9001;

/** Where each reader tab's chapter lives, keyed by the tab that asked. */
const chapters = new Map();

/**
 * Image hosts a page needed and we had no permission for.
 *
 * A reader page cannot ask for permissions — only an extension page can, and
 * only during a click. So the refusal is recorded here and the popup offers
 * it the next time it is opened, which turns a dead end into one button.
 */
const pendingHosts = new Set();

chrome.runtime.onStartup.addListener(clearRules);
chrome.runtime.onInstalled.addListener(clearRules);

async function clearRules() {
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  const ids = existing.filter((rule) => rule.id === RULE_ID).map((rule) => rule.id);
  if (ids.length) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
  }
}

/**
 * Send `referer` on our own requests to `host`, for as long as the callback
 * runs.
 *
 * Narrow on purpose: our own extension only, XHR only, one host. It cannot
 * affect the person's ordinary browsing, and it is torn down in a `finally`
 * so a thrown fetch cannot leave a header rule behind.
 */
async function withReferer(host, referer, body) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [RULE_ID],
    addRules: [
      {
        id: RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'referer', operation: 'set', value: referer }],
        },
        condition: {
          requestDomains: [host],
          initiatorDomains: [chrome.runtime.id],
          resourceTypes: ['xmlhttprequest'],
        },
      },
    ],
  });

  try {
    return await body();
  } finally {
    await chrome.declarativeNetRequest
      .updateSessionRules({ removeRuleIds: [RULE_ID] })
      .catch(() => undefined);
  }
}

const MAX_BYTES = 20 * 1024 * 1024;

/** Enough of a file's first bytes to know whether it is really an image. */
function looksLikeImage(bytes) {
  const b = bytes;
  if (b.length < 12) return false;
  if (b[0] === 0xff && b[1] === 0xd8) return true; // jpeg
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // png
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true; // gif
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return true; // webp
  // avif / heif share an ftyp box
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return true;
  return false;
}

function toDataUrl(bytes, type) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

async function fetchPage(url, referer) {
  const target = new URL(url);
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    throw new Error('That page link is not a web address.');
  }

  /*
   * Checked before fetching, because without it the only symptom is a bare
   * "Failed to fetch" — which is what a service worker throws when it has no
   * permission for a host, and is indistinguishable from the network being
   * down. Naming the host turns an unactionable message into an obvious one.
   */
  const allowed = await chrome.permissions.contains({
    origins: [`${target.protocol}//${target.hostname}/*`],
  });
  if (!allowed) {
    pendingHosts.add(target.hostname);
    throw new Error(
      `Couchlist cannot read images from ${target.hostname} yet. Click the Couchlist icon in your toolbar and press Allow.`,
    );
  }

  /*
   * `referer` is whatever the page's own <img> tag asked for — the full
   * chapter URL, the bare origin, or nothing at all when the tag says
   * no-referrer. It is used exactly as given: collapsing the three to one
   * guess is what produced 403s on sites that specify origin-only, because
   * the full URL is not an acceptable substitute for it.
   */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    // No Referer at all when the page said no-referrer: the rule is skipped
    // rather than set to something invented.
    const send = (body) =>
      referer === '' ? body() : withReferer(target.hostname, referer || target.origin + '/', body);

    const response = await send(() =>
      fetch(target.toString(), {
        // No cookies: the page is public or it is not ours to read.
        credentials: 'omit',
        // A redirect to another host would quietly defeat the host check.
        redirect: 'follow',
        signal: controller.signal,
      }),
    );

    if (!response.ok) {
      throw new Error(
        response.status === 403 || response.status === 401
          ? 'The source refused this page (403). It may only allow its own site to load images.'
          : `The source returned ${response.status} for this page.`,
      );
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) throw new Error('That page came back empty.');
    if (buffer.byteLength > MAX_BYTES) throw new Error('That page is unusually large.');

    const bytes = new Uint8Array(buffer);
    /*
     * A site that wants you signed in commonly answers 200 with an HTML
     * login page. Without this check the reader would render that as a
     * broken image and blame itself.
     */
    if (!looksLikeImage(bytes)) {
      throw new Error('That came back as a web page rather than an image. You may need to be signed in to the source.');
    }

    const type = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    return toDataUrl(bytes, type.startsWith('image/') ? type : 'image/jpeg');
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`${target.hostname} did not answer in time for this page.`);
    }
    // "Failed to fetch" is what fetch throws for every network-level
    // problem, and on its own it tells a reader nothing at all.
    if (error instanceof TypeError) {
      throw new Error(
        `Could not reach ${target.hostname} for this page. The image server may be blocking us, or Couchlist may not have access to it.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------- messaging */

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only our own pages and content scripts can talk to this worker.
  if (!sender.id || sender.id !== chrome.runtime.id) return false;

  if (message?.type === 'store-chapter') {
    chapters.set(message.key, message.chapter);
    respond({ ok: true });
    return false;
  }

  if (message?.type === 'take-chapter') {
    const chapter = chapters.get(message.key) ?? null;
    // Handed over once: the reader keeps it from here.
    chapters.delete(message.key);
    respond({ ok: true, chapter });
    return false;
  }

  if (message?.type === 'pending-hosts') {
    respond({ ok: true, hosts: [...pendingHosts] });
    return false;
  }

  if (message?.type === 'clear-pending') {
    pendingHosts.clear();
    respond({ ok: true });
    return false;
  }

  if (message?.type === 'page') {
    fetchPage(message.url, message.referer)
      .then((dataUrl) => respond({ ok: true, dataUrl }))
      .catch((error) => respond({ ok: false, error: error?.message || 'Could not load that page.' }));
    return true; // answered asynchronously
  }

  return false;
});
