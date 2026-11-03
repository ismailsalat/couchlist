'use client';

import { useState } from 'react';

/**
 * Pull the message out of an API failure.
 *
 * Routes answer with `{ error: { code, message, requestId } }`. Reading
 * `body.message` instead quietly swallowed every real explanation and showed
 * the fallback, so "that does not look like a web address" arrived as "that
 * did not work".
 */
function apiMessage(body: unknown, fallback: string): string {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === 'string' && message.length > 0 ? message : fallback;
}


/**
 * Region check.
 *
 * The question is "does this work where I am", and only your own browser can
 * answer it — our server sits in one place and its result says nothing about
 * yours. So the probe runs in the page and we compare it with what our last
 * scheduled check saw.
 *
 * The probe is a no-cors request, so we never see the response, only whether
 * anything came back. That is the right amount of information for "can I get
 * there from here", and it means this cannot tell a regional block from a
 * site being down for everybody — which is why the wording of each outcome
 * stops short of claiming it can.
 */

type Outcome = 'both' | 'only-us' | 'only-you' | 'neither';

interface ServerSide {
  reachable: boolean;
  checkedAt: string | null;
}

const COPY: Record<Outcome, { palette: string; title: string; body: string }> = {
  both: {
    palette: 'green',
    title: 'Works for you and for us',
    body: 'Your browser reached it and so did our last scheduled check. Nothing regional is in the way.',
  },
  'only-us': {
    palette: 'olive',
    title: 'We can reach it, you cannot',
    body: 'It answered our check but not your browser. That usually means a regional block, your network or DNS filtering it, or an extension stopping the request.',
  },
  'only-you': {
    palette: 'blue',
    title: 'You can reach it, we could not',
    body: 'Your browser got through where our last check did not. Our check may be out of date, or the site may refuse automated requests. Either way it works for you.',
  },
  neither: {
    palette: 'pink',
    title: 'Neither of us can reach it',
    body: 'It did not answer here or on our last check, so it is most likely down for everyone rather than blocked where you are.',
  },
};

async function probeFromHere(domain: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    await fetch(`https://${domain}/favicon.ico?cl=${Date.now()}`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function RegionCheck() {
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [server, setServer] = useState<ServerSide | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim() || busy) return;

    setBusy(true);
    setError(null);
    setOutcome(null);

    try {
      const response = await fetch('/api/tools/site-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(apiMessage(body, 'That address did not look right.'));
        return;
      }

      const signals = body.signals as Array<{ source: string; detail: string; checkedAt?: string }>;
      const check = signals.find((signal) => signal.source === 'Couchlist link check');
      const serverSide: ServerSide = {
        reachable: Boolean(check && /answered normally/iu.test(check.detail)),
        checkedAt: check?.checkedAt ?? null,
      };
      setServer(serverSide);

      const yours = await probeFromHere(body.domain as string);
      setOutcome(
        serverSide.reachable
          ? yours
            ? 'both'
            : 'only-us'
          : yours
            ? 'only-you'
            : 'neither',
      );
    } catch {
      setError('Could not run the check. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  const shown = outcome ? COPY[outcome] : null;

  return (
    <div data-palette="blue" className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="m-0 text-[18px] font-bold">Region check</h2>
      <p className="mb-4 mt-1 max-w-[60ch] text-[13.5px] text-muted">
        Compares what your browser can reach with what our scheduled check saw. If a site answers us
        and not you, something between you and it is in the way.
      </p>

      <form onSubmit={run} className="flex flex-wrap gap-2.5">
        <label className="sr-only" htmlFor="region-input">
          Site address
        </label>
        <input
          id="region-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="anikoto.cz"
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          className="min-h-11 flex-1 basis-60 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-text placeholder:text-muted/70"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="cl-touch min-h-11 rounded-xl bg-selected px-6 text-[14.5px] font-bold text-selected-fg hover:bg-selected-hover disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Check'}
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-4 text-[13.5px] text-danger-text">
          {error}
        </p>
      ) : null}

      {shown ? (
        <div
          data-palette={shown.palette}
          className="mt-4 rounded-xl border border-pal-line bg-pal-bg p-4"
          role="status"
        >
          <strong className="text-[15px] font-bold text-pal-text">{shown.title}</strong>
          <p className="mb-0 mt-1.5 max-w-[62ch] text-[13.5px] text-muted">{shown.body}</p>
          <p className="mb-0 mt-2.5 text-[12px] text-muted/75">
            {server?.checkedAt
              ? `Our side was last checked ${new Date(server.checkedAt).toLocaleDateString()}.`
              : 'We have no scheduled check for this one yet, so the comparison is one-sided.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
