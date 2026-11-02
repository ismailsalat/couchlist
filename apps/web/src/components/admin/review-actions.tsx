'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Approve / reject for one queued item.
 *
 * Disabled while a request is in flight, so a double click cannot approve
 * twice. On failure the message from the server is shown; nothing reports a
 * success that did not happen.
 */
export function ReviewActions({
  endpoint,
  approveLabel = 'Approve',
  onDone,
}: {
  endpoint: string;
  approveLabel?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function send(decision: 'APPROVE' | 'REJECT') {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, reviewNotes: notes || undefined }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not go through.');
        return;
      }
      onDone?.();
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

      {rejecting ? (
        <>
          <label htmlFor={`notes-${endpoint}`} className="text-sm text-muted">
            Short reason for the contributor
          </label>
          <textarea
            id={`notes-${endpoint}`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-field border border-line bg-bg px-3 py-2 text-sm text-text"
            placeholder="Duplicate of an existing listing."
          />
        </>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void send('APPROVE')}
          className="cl-touch inline-flex items-center rounded-pill bg-selected px-3.5 py-2 text-sm font-semibold text-selected-fg hover:bg-selected-hover disabled:opacity-60"
        >
          {busy ? 'Working…' : approveLabel}
        </button>

        {rejecting ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void send('REJECT')}
              className="cl-touch inline-flex items-center rounded-pill border border-line bg-active px-3.5 py-2 text-sm text-text hover:bg-hover disabled:opacity-60"
            >
              Confirm reject
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="cl-touch inline-flex items-center rounded-pill px-3 py-2 text-sm text-muted hover:text-text"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="cl-touch inline-flex items-center rounded-pill border border-line bg-surface px-3.5 py-2 text-sm text-text hover:bg-hover"
          >
            Reject…
          </button>
        )}
      </div>
    </div>
  );
}
