'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field, inputClass } from './ui/field';

/**
 * Reports a problem with a listing.
 *
 * Three reasons, matching the directory's warnings. A second report from the
 * same person about the same source is accepted and quietly collapsed, so the
 * reporter is not told off for a double tap.
 */
export function ReportForm({ sourceId, sourceName }: { sourceId: string; sourceName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/sources/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceId,
          reason: String(form.get('reason') ?? 'OTHER'),
          details: String(form.get('details') ?? '') || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not send.');
        return;
      }
      setDone(
        body.alreadyReported
          ? 'You had already reported this one. It is still in the queue.'
          : 'Thanks — a moderator will look at this.',
      );
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="m-0 text-sm text-muted">{done}</p>
        <button
          type="button"
          onClick={() => router.push(`/sources/${sourceId}`)}
          className="cl-touch mt-3 inline-flex items-center rounded-pill border border-line bg-active px-3.5 py-2.5 text-sm text-text hover:bg-hover"
        >
          Back to {sourceName}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <p role="alert" className="m-0 rounded-field border border-line bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
          {error}
        </p>
      ) : null}

      <fieldset className="m-0 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-semibold text-text">What is the problem?</legend>
        {[
          ['BROKEN_LINK', 'Broken link', 'The site is gone, or the address no longer works.'],
          ['LOTS_OF_ADS', 'Lots of ads', 'Pop-ups, redirects or misleading play buttons.'],
          ['OTHER', 'Something else', 'Tell us below.'],
        ].map(([value, label, hint], index) => (
          <label key={value} className="mt-2 flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name="reason"
              value={value}
              defaultChecked={index === 0}
              className="mt-1 h-4 w-4 accent-[var(--cl-selected)]"
            />
            <span className="text-sm">
              <span className="block text-text">{label}</span>
              <span className="block text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Field label="Anything else?" htmlFor="details" optional>
        <textarea id="details" name="details" rows={3} maxLength={600} className={inputClass} />
      </Field>

      <button
        type="submit"
        disabled={busy}
        className="cl-touch flex w-full items-center justify-center rounded-pill bg-selected px-4 py-3 text-base font-semibold text-selected-fg shadow-primary hover:bg-selected-hover disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send report'}
      </button>

      <p className="m-0 text-xs text-muted">
        Reports about the same source are grouped, so one issue does not become a wall of repeated
        work for a moderator.
      </p>
    </form>
  );
}
