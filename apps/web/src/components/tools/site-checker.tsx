'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SiteVerdict, VerdictLevel } from '@couchlist/shared';
import { Pill } from './tool-glyph';

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
 * The safety checker.
 *
 * Shows the level, then every signal by name underneath. The list of named
 * signals is the honest part: "Google Safe Browsing: clean, URLhaus: not
 * configured" is a report, while a single blended trust score would be a
 * number we made up.
 */

const TONE: Record<VerdictLevel, { palette: string; dot: string }> = {
  LISTED_OK: { palette: 'green', dot: '#b9e1c6' },
  LISTED_WARN: { palette: 'olive', dot: '#f6ba7b' },
  REMOVED: { palette: 'pink', dot: '#ffb0b0' },
  DANGEROUS: { palette: 'pink', dot: '#ffb0b0' },
  UNKNOWN: { palette: 'slate', dot: '#c3d6ee' },
};

const STATUS_WORD: Record<string, string> = {
  clean: 'clean',
  flagged: 'flagged',
  unknown: 'no answer',
  unavailable: 'unavailable',
};

export function SiteChecker({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
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
        setError(apiMessage(body, 'That did not work. Try again in a moment.'));
        return;
      }
      setVerdict(body as SiteVerdict);
    } catch {
      setVerdict(null);
      setError('Could not reach Couchlist. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const tone = verdict ? TONE[verdict.level] : null;

  return (
    <div data-palette="green" className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-[18px] font-bold">Is this site safe?</h2>
        <Pill palette="green">Safety</Pill>
      </div>
      <p className="mb-4 mt-0 max-w-[60ch] text-[13.5px] text-muted">
        Paste a link. We check it against our own directory, the public blocklists we keep a copy of,
        and the reputation services we have keys for.
      </p>

      <form onSubmit={run} className="flex flex-wrap gap-2.5">
        <label className="sr-only" htmlFor="site-check-input">
          Site address
        </label>
        <input
          id="site-check-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="anikoto.cz"
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          maxLength={260}
          className="min-h-11 flex-1 basis-60 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-text placeholder:text-muted/70"
        />
        <button
          type="submit"
          disabled={busy || query.trim().length === 0}
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

      {verdict && tone ? (
        <div
          data-palette={tone.palette}
          className="mt-4 rounded-xl border border-pal-line bg-pal-bg p-4"
          role="status"
        >
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: tone.dot }} aria-hidden />
            <strong className="text-[15px] font-bold text-pal-text">{verdict.title}</strong>
          </div>
          <p className="mb-0 mt-1.5 max-w-[64ch] text-[13.5px] text-muted">{verdict.body}</p>

          {verdict.source ? (
            <Link
              href={verdict.source.slugPath}
              className="mt-2.5 inline-block text-[13px] font-semibold text-pal-text underline underline-offset-[3px]"
            >
              Open the listing for {verdict.source.name}
            </Link>
          ) : null}

          <ul className="mt-3.5 flex list-none flex-col gap-1.5 border-t border-pal-line/60 p-0 pt-3">
            {verdict.signals.map((signal, index) => (
              <li key={`${signal.source}-${index}`} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                <span className="font-semibold text-pal-text">{signal.source}</span>
                <span className="text-muted">— {STATUS_WORD[signal.status] ?? signal.status}.</span>
                <span className="text-muted/85">{signal.detail}</span>
              </li>
            ))}
          </ul>

          <p className="mb-0 mt-3 text-[12px] text-muted/75">
            A clean result means nobody has reported this address. It is not a promise that it is safe.
          </p>
        </div>
      ) : null}
    </div>
  );
}
