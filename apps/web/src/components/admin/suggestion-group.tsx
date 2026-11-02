'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CreditMode } from '@couchlist/shared';
import { CategoryPill } from '../ui/category-pill';

/**
 * One website, however many people suggested it.
 *
 * The moderator reads the submissions side by side, picks whichever write-up
 * is best, and approves once. Everyone in the group is credited, with the
 * earliest submitter recorded as having found it first — so a better-written
 * second entry wins the listing without taking the first finder's credit.
 */

export interface GroupSubmission {
  id: string;
  suggestedName: string;
  homepageUrl: string;
  description: string | null;
  comment: string | null;
  createdAt: string;
  submitterName: string | null;
  creditMode: CreditMode;
  hasIcon: boolean;
  categories: string[];
}

export function SuggestionGroup({
  domain,
  submissions,
  alreadyListedId,
  defaultOpen = true,
}: {
  domain: string;
  submissions: GroupSubmission[];
  alreadyListedId?: string | null;
  /** Open on arrival. False once the queue is long enough to need scanning. */
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  // Defaults to the first submission; the moderator can pick another.
  const [chosen, setChosen] = useState(submissions[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const many = submissions.length > 1;

  async function send(decision: 'APPROVE' | 'REJECT') {
    if (busy || !chosen) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/suggestions/${chosen}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, reviewNotes: notes || undefined }),
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
    <details
      open={defaultOpen}
      className="cl-queue-item rounded-card border-2 border-line bg-surface [&[open]>summary]:border-b [&[open]>summary]:border-line"
    >
      {/*
       * Collapsed by default once the queue is long. A moderator with sixty
       * websites waiting needs to see the shape of the queue before they can
       * decide where to start; sixty expanded cards is a scroll, not a queue.
       */}
      <summary className="cl-touch flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-t-card p-4 hover:bg-hover">
        <div className="min-w-0">
          <p className="m-0 text-base font-bold text-text">{domain}</p>
          <p className="m-0 mt-0.5 text-sm text-muted">
            {many
              ? `${submissions.length} people suggested this website`
              : 'One suggestion'}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {many ? (
            <span className="rounded-pill border-2 border-accent bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">
              {submissions.length} submissions
            </span>
          ) : null}
          <span aria-hidden="true" className="cl-queue-chevron text-muted">
            &#9662;
          </span>
        </span>
      </summary>

      <div className="p-4">

      {alreadyListedId ? (
        <p className="m-0 mt-2.5 rounded-field border-2 border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-text">
          That domain is already listed.{' '}
          <Link href={`/sources/${alreadyListedId}`} className="underline">
            Open the existing source
          </Link>
        </p>
      ) : null}

      {many ? (
        <p className="m-0 mb-2 mt-4 text-sm font-semibold text-text">
          Pick the best write-up — everyone below gets credited either way.
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-2.5">
        {submissions.map((submission, index) => {
          const selected = submission.id === chosen;
          return (
            <label
              key={submission.id}
              className={`flex cursor-pointer items-start gap-3 rounded-card border-2 p-3 ${
                selected ? 'border-accent bg-accent-soft/40' : 'border-line bg-bg hover:bg-hover'
              }`}
            >
              {many ? (
                <input
                  type="radio"
                  name={`chosen-${domain}`}
                  checked={selected}
                  onChange={() => setChosen(submission.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--cl-selected)]"
                />
              ) : null}

              {submission.hasIcon ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/admin/candidates/${submission.id}/icon`}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg border-2 border-line object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 border-dashed border-line text-xs text-muted"
                >
                  —
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-bold text-text">
                  {submission.suggestedName}
                  {index === 0 ? (
                    <span className="ml-2 rounded-pill border border-line bg-surface px-1.5 py-px text-xs font-normal text-muted">
                      first to suggest
                    </span>
                  ) : null}
                </p>
                {submission.description ? (
                  <p className="m-0 mt-0.5 text-sm text-muted">{submission.description}</p>
                ) : (
                  <p className="m-0 mt-0.5 text-sm italic text-muted">no description</p>
                )}

                {submission.categories.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {submission.categories.map((category) => (
                      <CategoryPill key={category} category={category as never} />
                    ))}
                  </div>
                ) : null}

                {submission.comment ? (
                  <p className="m-0 mt-1.5 text-sm text-muted">
                    <span className="text-text">Why:</span> {submission.comment}
                  </p>
                ) : null}

                <p className="m-0 mt-1.5 text-xs text-muted">
                  {submission.submitterName ?? 'a deleted account'}
                  {submission.creditMode === CreditMode.ANONYMOUS
                    ? ' — asked to be credited publicly as Anonymous'
                    : ''}
                  {' · '}
                  {submission.createdAt.slice(0, 10)}
                  {submission.homepageUrl !== `https://${domain}/` ? ` · ${submission.homepageUrl}` : ''}
                </p>
              </div>
            </label>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="m-0 mt-3 text-sm text-accent">
          {error}
        </p>
      ) : null}

      {rejecting ? (
        <div className="mt-3">
          <label htmlFor={`notes-${domain}`} className="text-sm text-muted">
            Short reason, shown to everyone who suggested it
          </label>
          <textarea
            id={`notes-${domain}`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            maxLength={500}
            className="mt-1 w-full rounded-field border-2 border-line bg-bg px-3 py-2 text-sm text-text"
            placeholder="Already covered by another listing."
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void send('APPROVE')}
          className="cl-touch cl-pill inline-flex items-center rounded-pill bg-selected px-4 py-2 text-sm font-bold text-selected-fg shadow-pop-red hover:bg-selected-hover disabled:opacity-60"
        >
          {busy
            ? 'Working…'
            : many
              ? `Approve and credit all ${submissions.length}`
              : 'Approve and publish'}
        </button>

        {rejecting ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void send('REJECT')}
              className="cl-touch inline-flex items-center rounded-pill border-2 border-line bg-active px-3.5 py-2 text-sm font-semibold text-text hover:bg-hover disabled:opacity-60"
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
            className="cl-touch inline-flex items-center rounded-pill border-2 border-line bg-surface px-3.5 py-2 text-sm font-semibold text-text hover:bg-hover"
          >
            Reject…
          </button>
        )}
      </div>

      <p className="m-0 mt-2 text-xs text-muted">
        Approving publishes the source immediately and credits{' '}
        {many ? 'every submitter above' : 'the submitter'}. The earliest is recorded as having
        found it first.
      </p>
      </div>
    </details>
  );
}
