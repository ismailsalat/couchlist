'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, X } from 'lucide-react';

/**
 * One screenshot, and the only two things worth doing with it.
 *
 * Shown large, because the decision is "does this look like the site, and is
 * it something a reader should see" and that cannot be made from a thumbnail.
 */
export function PreviewReview({
  sourceId,
  sourceName,
  domain,
  capturedFrom,
}: {
  sourceId: string;
  sourceName: string;
  domain: string;
  capturedFrom: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (gone) return null;

  async function decide(action: 'approve' | 'discard') {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/previews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: sourceId, action }),
      });
      if (!response.ok) {
        setError('That did not work.');
        return;
      }
      setGone(true);
      router.refresh();
    } catch {
      setError('That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-card border-2 border-line bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/admin/sources/${sourceId}/preview`}
        alt={`Screenshot of ${domain}`}
        className="block max-h-[360px] w-full border-b border-line object-cover object-top"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="m-0 text-base font-bold text-text">{sourceName}</p>
          <p className="m-0 mt-0.5 break-all text-sm text-muted">
            {capturedFrom ?? domain}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide('approve')}
            className="cl-touch inline-flex items-center gap-2 rounded-pill bg-selected px-4 py-2.5 text-sm font-semibold text-selected-fg hover:bg-selected-hover disabled:opacity-60"
          >
            <Check aria-hidden="true" className="h-4 w-4" />
            Use it
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide('discard')}
            className="cl-touch inline-flex items-center gap-2 rounded-pill border border-line bg-bg px-4 py-2.5 text-sm text-text hover:bg-hover disabled:opacity-60"
          >
            <X aria-hidden="true" className="h-4 w-4" />
            Discard
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="m-0 px-4 pb-3 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </article>
  );
}
