'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Undo2 } from 'lucide-react';

/** Puts a deleted listing back, hidden, with its votes and credit intact. */
export function RestoreButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/deleted', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        setError('That did not work.');
        return;
      }
      router.refresh();
    } catch {
      setError('That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void restore()}
        aria-label={`Restore ${name}`}
        className="cl-touch inline-flex items-center gap-2 rounded-pill bg-selected px-3 py-2 text-sm font-semibold text-selected-fg hover:bg-selected-hover disabled:opacity-60"
      >
        <Undo2 aria-hidden="true" className="h-4 w-4" />
        {busy ? 'Restoring…' : 'Restore'}
      </button>
      {error ? (
        <p role="alert" className="m-0 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </>
  );
}
