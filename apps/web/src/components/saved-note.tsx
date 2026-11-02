'use client';

import { useState } from 'react';

/**
 * The private note on a saved source.
 *
 * Owner-only by construction: the note is loaded on the server for the signed-
 * in viewer and written back through the save endpoint, which keys on the
 * session's account. It never appears in a public response.
 */
export function SavedNote({
  sourceId,
  saved,
  note,
}: {
  sourceId: string;
  saved: boolean;
  note: string | null;
}) {
  const [value, setValue] = useState(note ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  if (!saved) {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <h2 className="m-0 text-lg font-semibold">Your private note</h2>
        <p className="m-0 mt-2 text-sm text-muted">
          Save this source to add a note. Notes are visible only to you.
        </p>
      </div>
    );
  }

  async function save() {
    setStatus('saving');
    try {
      const response = await fetch(`/api/sources/${sourceId}/save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: value }),
      });
      setStatus(response.ok ? 'saved' : 'error');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <h2 className="m-0 text-lg font-semibold">Your private note</h2>
      <p className="m-0 mb-2.5 mt-1 text-sm text-muted">Only you can read this.</p>

      <label htmlFor="saved-note" className="sr-only">
        Private note
      </label>
      <textarea
        id="saved-note"
        value={value}
        maxLength={500}
        rows={3}
        onChange={(event) => {
          setValue(event.target.value);
          setStatus('idle');
        }}
        className="w-full rounded-field border border-line bg-bg px-3 py-2.5 text-sm text-text"
        placeholder="Good for older seasons. Needs a blocker."
      />

      <div className="mt-2.5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={status === 'saving'}
          className="cl-touch rounded-pill border border-line bg-active px-3.5 py-2 text-sm text-text hover:bg-hover disabled:opacity-60"
        >
          {status === 'saving' ? 'Saving…' : 'Save note'}
        </button>
        {status === 'saved' ? (
          <span role="status" className="text-sm text-muted">
            Saved.
          </span>
        ) : null}
        {status === 'error' ? (
          <span role="alert" className="text-sm text-accent">
            That did not save. Try again.
          </span>
        ) : null}
      </div>
    </div>
  );
}
