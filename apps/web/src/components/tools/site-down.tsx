'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SiteVerdict } from '@couchlist/shared';

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
 * "This stopped working — what else is there?"
 *
 * Built entirely from data nothing else on the web has: the mirrors table
 * and the weekly health check. It reuses the safety endpoint rather than
 * adding a second one, because it is the same lookup asked a different
 * question, and two endpoints would mean two round trips and two rate-limit
 * buckets for one answer.
 */
export function SiteDown() {
  const [query, setQuery] = useState('');
  const [verdict, setVerdict] = useState<SiteVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim() || busy) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/tools/site-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const body = await response.json();
      if (!response.ok) {
        setVerdict(null);
        setError(apiMessage(body, 'That address did not look right.'));
        return;
      }
      setVerdict(body as SiteVerdict);
    } catch {
      setVerdict(null);
      setError('Could not reach Couchlist. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  const check = verdict?.signals.find((signal) => signal.source === 'Couchlist link check');

  return (
    <div data-palette="blue" className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="m-0 text-[18px] font-bold">Site down — what else?</h2>
      <p className="mb-4 mt-1 max-w-[60ch] text-[13.5px] text-muted">
        Paste the address that stopped working. If we list it, you get the other addresses it answers
        on and the closest things in the same categories.
      </p>

      <form onSubmit={run} className="flex flex-wrap gap-2.5">
        <label className="sr-only" htmlFor="site-down-input">
          Site address
        </label>
        <input
          id="site-down-input"
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
          {busy ? 'Looking…' : 'Find alternatives'}
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-4 text-[13.5px] text-danger-text">
          {error}
        </p>
      ) : null}

      {verdict ? (
        <div data-palette="blue" className="mt-4 rounded-xl border border-pal-line bg-pal-bg p-4" role="status">
          {verdict.source ? (
            <>
              <strong className="text-[15px] font-bold text-pal-text">{verdict.source.name}</strong>
              <p className="mb-0 mt-1 text-[13px] text-muted">
                {check ? check.detail : 'We have not checked this one yet.'}
              </p>
            </>
          ) : (
            <>
              <strong className="text-[15px] font-bold text-pal-text">Not in the directory</strong>
              <p className="mb-0 mt-1 max-w-[62ch] text-[13px] text-muted">
                We do not list this address, so there are no mirrors to offer. Browsing by category in
                Discover is the next best thing.
              </p>
            </>
          )}

          {verdict.mirrors?.length ? (
            <div className="mt-3.5 border-t border-pal-line/60 pt-3">
              <p className="m-0 text-[12.5px] font-semibold text-pal-text">Other addresses it answers on</p>
              <ul className="mt-1.5 flex list-none flex-wrap gap-2 p-0">
                {verdict.mirrors.map((mirror) => (
                  <li
                    key={mirror}
                    className="rounded-pill border border-pal-line px-2.5 py-1 text-[12.5px] text-muted"
                  >
                    {mirror}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {verdict.alternatives?.length ? (
            <div className="mt-3.5 border-t border-pal-line/60 pt-3">
              <p className="m-0 text-[12.5px] font-semibold text-pal-text">Close alternatives</p>
              <ul className="mt-1.5 flex list-none flex-col gap-1.5 p-0">
                {verdict.alternatives.map((entry) => (
                  <li key={entry.id} className="text-[13px]">
                    <Link
                      href={`/source/${entry.id}`}
                      className="font-semibold text-pal-text underline underline-offset-[3px]"
                    >
                      {entry.name}
                    </Link>
                    <span className="text-muted"> — {entry.domain}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : verdict.source ? (
            <p className="mb-0 mt-3 text-[12.5px] text-muted/80">
              Nothing else in the directory shares its categories yet.
            </p>
          ) : null}

          <Link
            href="/"
            className="mt-3.5 inline-block text-[13px] font-semibold text-pal-text underline underline-offset-[3px]"
          >
            Browse the directory
          </Link>
        </div>
      ) : null}
    </div>
  );
}
