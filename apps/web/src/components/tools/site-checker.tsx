'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SiteVerdict, VerdictLevel, VerdictSignal } from '@couchlist/shared';
import { Pill } from './tool-glyph';
import { SignalList, SignalRow, ToolResult, type Tone } from './result';

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

const LEVEL_TONE: Record<VerdictLevel, Tone> = {
  LISTED_OK: 'good',
  LISTED_WARN: 'warn',
  REMOVED: 'bad',
  DANGEROUS: 'bad',
  UNKNOWN: 'neutral',
};

/**
 * How one piece of evidence reads.
 *
 * `unavailable` is deliberately not a failure mark. A provider we have no key
 * for has not gone wrong; it simply has nothing to say, and dressing that as
 * an error teaches people to ignore the marks that matter.
 */
function signalTone(signal: VerdictSignal): Tone {
  if (signal.status === 'flagged') return 'bad';
  if (signal.status === 'clean') return 'good';
  if (signal.status === 'unavailable') return 'off';
  return 'neutral';
}

function ago(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

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

  return (
    <div data-palette="green" className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-[18px] font-bold">Check a link</h2>
        <Pill palette="green">Safety</Pill>
      </div>
      <p className="mb-4 mt-0 max-w-[60ch] text-[13.5px] text-muted">
        Paste a link. You get what we know about it, the other addresses it answers on, and what to
        use instead if it has stopped working.
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
          className="min-h-11 w-full min-w-0 flex-1 basis-60 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-text placeholder:text-muted/70"
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

      {verdict ? (
        <ToolResult
          tone={LEVEL_TONE[verdict.level]}
          title={verdict.title}
          footer={
            <>
            {verdict.mirrors?.length ? (
              <div className="mb-4">
                <SignalList label="Also answers on">
                  {verdict.mirrors.map((mirror) => (
                    <SignalRow key={mirror} tone="good" name={mirror} detail="Known address" />
                  ))}
                </SignalList>
              </div>
            ) : null}

            {verdict.alternatives?.length ? (
              <div className="mb-4">
                <SignalList label="If this one is not working">
                  {verdict.alternatives.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 py-[7px]">
                      <Link
                        href={`/source/${entry.id}`}
                        className="text-[13.5px] font-semibold text-text underline underline-offset-[3px]"
                      >
                        {entry.name}
                      </Link>
                      <span className="ml-auto text-right text-[13px] text-muted">{entry.domain}</span>
                    </li>
                  ))}
                </SignalList>
              </div>
            ) : null}

            <SignalList>
              {verdict.signals.map((signal, index) => (
                <SignalRow
                  key={`${signal.source}-${index}`}
                  tone={signalTone(signal)}
                  name={signal.source}
                  detail={signal.detail}
                  when={ago(signal.checkedAt)}
                />
              ))}
            </SignalList>
            </>
          }
        >
          <p className="m-0">{verdict.body}</p>
          {verdict.source ? (
            <Link
              href={verdict.source.slugPath}
              className="mt-2 inline-block text-[13.5px] font-semibold text-pal-text underline underline-offset-[3px]"
            >
              Open {verdict.source.name}
            </Link>
          ) : null}
        </ToolResult>
      ) : null}

    </div>
  );
}
