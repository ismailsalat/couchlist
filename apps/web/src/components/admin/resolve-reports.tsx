'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Resolves or dismisses the whole group of reports for one source. */
export function ResolveReports({ sourceId, count }: { sourceId: string; count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function send(action: 'RESOLVE' | 'DISMISS') {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceId, action, resolutionNote: note || undefined }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not go through.');
        return;
      }
      router.refresh();
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {error ? (
        <p role="alert" className="m-0 text-sm text-accent">
          {error}
        </p>
      ) : null}

      <label htmlFor={`note-${sourceId}`} className="sr-only">
        What was done
      </label>
      <input
        id={`note-${sourceId}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        placeholder="What was done — shown to the reporters"
        className="w-full rounded-field border border-line bg-bg px-3 py-2 text-sm text-text"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void send('RESOLVE')}
          className="cl-touch inline-flex items-center rounded-pill bg-selected px-3.5 py-2 text-sm font-semibold text-selected-fg hover:bg-selected-hover disabled:opacity-60"
        >
          {busy ? 'Working…' : `Resolve all ${count}`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void send('DISMISS')}
          className="cl-touch inline-flex items-center rounded-pill border border-line bg-active px-3.5 py-2 text-sm text-text hover:bg-hover disabled:opacity-60"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
