'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Undo2 } from 'lucide-react';

/**
 * A moderator's answer to an external reputation flag.
 *
 * Public blocklists are evidence, not verdicts, and nobody maintaining one
 * has heard of this directory. This is how a moderator says "we looked, and
 * we are keeping it" without the site hiding the flag from readers: the
 * warning still appears in the checker, with the review printed beside it.
 *
 * The review is scoped server-side to the providers flagging the domain at
 * the moment it is made. Anything that flags it later is evidence nobody has
 * reviewed, and the warning returns on its own.
 */
export function ReputationReview({
  sourceId,
  reviewedAt,
  reviewedSources,
  note,
}: {
  sourceId: string;
  reviewedAt: string | null;
  reviewedSources: string[] | null;
  note: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);

  async function send(method: 'POST' | 'DELETE') {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sources/${sourceId}/reputation`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({ note: draft }) : undefined,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'That did not work.');
        return;
      }
      setOpen(false);
      setDraft('');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (reviewedAt) {
    return (
      <div className="rounded-xl border border-line bg-bg p-3">
        <p className="m-0 flex items-center gap-2 text-xs font-semibold text-[#b9e1c6]">
          <ShieldCheck aria-hidden className="h-4 w-4" />
          Kept despite {reviewedSources?.join(', ') || 'a flag'}
        </p>
        <p className="m-0 mt-1 text-xs text-muted">
          Reviewed {new Date(reviewedAt).toLocaleDateString()}
          {note ? ` — ${note}` : ''}. Readers still see the flag, with this review beside it.
        </p>
        <button
          type="button"
          onClick={() => void send('DELETE')}
          disabled={busy}
          className="cl-touch mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-line px-3 text-xs font-semibold text-muted hover:text-text disabled:opacity-50"
        >
          <Undo2 aria-hidden className="h-3.5 w-3.5" />
          Withdraw the review
        </button>
        {error ? <p className="m-0 mt-2 text-xs text-danger-text">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-bg p-3">
      {open ? (
        <>
          <label className="block text-xs font-semibold text-text" htmlFor={`rep-${sourceId}`}>
            Why are you keeping it?
          </label>
          <input
            id={`rep-${sourceId}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={300}
            placeholder="Checked the report, it was one bad advert and it is gone."
            className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-xs text-text placeholder:text-muted/70"
          />
          <p className="m-0 mt-1.5 text-xs text-muted">
            This is shown to readers next to the warning, so write it for them.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void send('POST')}
              disabled={busy}
              className="cl-touch min-h-9 rounded-pill bg-selected px-3.5 text-xs font-bold text-selected-fg disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Keep this listing'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cl-touch min-h-9 rounded-pill border border-line px-3.5 text-xs font-semibold text-muted"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cl-touch inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-line px-3 text-xs font-semibold text-muted hover:text-text"
        >
          <ShieldAlert aria-hidden className="h-3.5 w-3.5" />
          Keep despite a safety flag
        </button>
      )}
      {error ? <p className="m-0 mt-2 text-xs text-danger-text">{error}</p> : null}
    </div>
  );
}
