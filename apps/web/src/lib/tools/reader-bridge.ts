'use client';

/**
 * Talking to the Couchlist extension from the reader.
 *
 * Page images cannot be loaded straight from a source's CDN. Most of them
 * refuse any request whose Referer is not their own site, so an `<img>` on
 * couchlist.io gets a 403 and the reader shows a broken page. The extension
 * can fetch them with the right Referer; this is how we ask it to.
 *
 * The channel is `window.postMessage` to our own origin, answered by a
 * content script the extension injects. Every message carries a tag and a
 * one-shot id, so a reply can never be matched to the wrong request and any
 * other page chatter is ignored.
 */

import { versionAtLeast, type ExtensionState } from '@couchlist/shared';

const TAG = 'couchlist-reader-extension';
const TIMEOUT_MS = 30_000;

let nextId = 0;

interface Reply {
  ok?: boolean;
  error?: string;
  dataUrl?: string;
  chapter?: unknown;
  version?: string;
}

function ask(request: Record<string, unknown>, timeoutMs = TIMEOUT_MS): Promise<Reply> {
  return new Promise((resolve) => {
    const id = `r${(nextId += 1)}-${Date.now()}`;
    let done = false;

    const finish = (reply: Reply) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      resolve(reply);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as (Reply & { tag?: string; id?: string; reply?: boolean }) | null;
      if (!data || data.tag !== TAG || data.id !== id || !data.reply) return;
      finish(data);
    };

    // A missing extension never answers, so every request needs its own way out.
    const timer = window.setTimeout(
      () => finish({ ok: false, error: 'The Couchlist extension did not answer.' }),
      timeoutMs,
    );

    window.addEventListener('message', onMessage);
    window.postMessage({ tag: TAG, id, ...request }, window.location.origin);
  });
}

/**
 * Whether the extension is there, and new enough.
 *
 * Three answers, not two. An extension from before page relaying existed
 * never answers a page request, exactly like no extension at all — so
 * without the version the reader can only report "no reply", which tells
 * somebody nothing about what to do next.
 */
export async function extensionState(): Promise<ExtensionState> {
  const reply = await ask({ type: 'ping' }, 1_500);
  if (reply.ok !== true) return 'missing';
  // An extension too old to report a version is certainly too old.
  if (!reply.version || !versionAtLeast(reply.version)) return 'outdated';
  return 'ready';
}

/** Collect a chapter the extension put aside, by its one-time key. */
export async function takeChapter(key: string): Promise<unknown | null> {
  const reply = await ask({ type: 'take-chapter', key }, 5_000);
  return reply.ok ? (reply.chapter ?? null) : null;
}

/**
 * Fetch one page through the extension.
 *
 * Returns a data URL. Throws with the extension's own wording, which
 * distinguishes "the source refused this" from "you need to be signed in"
 * from "the extension is not there" — all of which look identical as a
 * broken image.
 */
export async function fetchPageThroughExtension(url: string, referer: string): Promise<string> {
  const reply = await ask({ type: 'page', url, referer });
  if (!reply.ok || !reply.dataUrl) {
    throw new Error(reply.error || 'That page could not be loaded.');
  }
  return reply.dataUrl;
}
