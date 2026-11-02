'use client';

import { useState } from 'react';
import { Unplug } from 'lucide-react';

/**
 * Reporting a broken link in one click.
 *
 * The full report form is right for "this site has malware" and far too much
 * for "the link is broken" — which is both the commonest problem and the
 * easiest one to confirm. Asking for a form, a reason and a description to
 * say a page did not load means most people simply do not say it, and the
 * directory stays wrong.
 *
 * It files the same BROKEN_LINK report the form does, so one queue, one set
 * of rules, and no second way for a report to exist. A human saying this
 * alongside a failing automated check is strong evidence; either alone is
 * only a hint.
 */
export function LooksDeadButton({
  sourceId,
  sourceName,
  canReport,
}: {
  sourceId: string;
  sourceName: string;
  /** Signed in and verified. Otherwise this is a link to sign in. */
  canReport: boolean;
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function report() {
    setState('sending');
    try {
      const response = await fetch('/api/sources/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceId, reason: 'BROKEN_LINK' }),
      });
      // A duplicate is still a success from the reporter's point of view:
      // they said the thing, and it is on record.
      setState(response.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  if (!canReport) {
    return (
      <a
        href={`/login?next=${encodeURIComponent(`/sources/${sourceId}`)}&intent=${encodeURIComponent(`report ${sourceName}`)}`}
        className="cl-touch inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3.5 py-2.5 text-sm text-text no-underline hover:bg-hover"
      >
        <Unplug aria-hidden="true" className="h-4 w-4" />
        Link looks dead
      </a>
    );
  }

  if (state === 'sent') {
    return (
      <p className="m-0 inline-flex items-center gap-2 rounded-pill border border-line bg-bg px-3.5 py-2.5 text-sm text-muted">
        Thanks &mdash; a moderator will check it.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void report()}
      disabled={state === 'sending'}
      className="cl-touch inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3.5 py-2.5 text-sm text-text hover:bg-hover disabled:opacity-60"
    >
      <Unplug aria-hidden="true" className="h-4 w-4" />
      {state === 'sending' ? 'Reporting…' : state === 'error' ? 'That did not send. Try again' : 'Link looks dead'}
    </button>
  );
}
