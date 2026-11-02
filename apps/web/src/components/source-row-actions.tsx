'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Bookmark, BookmarkCheck, ThumbsDown, ThumbsUp } from 'lucide-react';

/**
 * Feedback and save controls for one row.
 *
 * Behaviour that matters:
 *  - The displayed state updates immediately, then is corrected by the
 *    server's answer. If the request fails, the previous state comes back and
 *    a short message says so. Nothing shows a success that did not happen.
 *  - A signed-out visitor is sent to sign in with a return path, so the action
 *    they wanted happens after they are back. Nothing claims to have saved to
 *    an account before that.
 *  - A request in flight disables the control, so a double click cannot send
 *    two votes.
 */

type Vote = 'LIKE' | 'DISLIKE' | null;

export function SourceRowActions({
  sourceId,
  sourceName,
  initialLikes,
  initialDislikes,
  initialVote,
  initialSaved,
  canInteract,
  showDislike = true,
}: {
  sourceId: string;
  sourceName: string;
  initialLikes: number;
  initialDislikes: number;
  initialVote: Vote;
  initialSaved: boolean;
  canInteract: boolean;
  showDislike?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [likes, setLikes] = useState(initialLikes);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [vote, setVote] = useState<Vote>(initialVote);
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState<null | 'vote' | 'save'>(null);
  const [error, setError] = useState<string | null>(null);

  function requireSignIn(intent: string): boolean {
    if (canInteract) return false;
    const next = `${window.location.pathname}${window.location.search}`;
    router.push(`/login?next=${encodeURIComponent(next)}&intent=${encodeURIComponent(intent)}`);
    return true;
  }

  async function castVote(next: 'LIKE' | 'DISLIKE') {
    if (requireSignIn(`${next === 'LIKE' ? 'like' : 'dislike'} ${sourceName}`)) return;
    if (busy) return;

    // Clicking the vote you already hold clears it.
    const value = vote === next ? 'NONE' : next;
    const previous = { likes, dislikes, vote };

    setBusy('vote');
    setError(null);
    applyVoteLocally(value);

    try {
      const response = await fetch(`/api/sources/${sourceId}/vote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      const body = await response.json();

      if (!response.ok) {
        setLikes(previous.likes);
        setDislikes(previous.dislikes);
        setVote(previous.vote);
        setError(body?.error?.message ?? 'That did not save.');
        return;
      }

      // The server's totals are the truth, not the optimistic guess.
      setLikes(body.likes);
      setDislikes(body.dislikes);
      setVote(body.userVote ?? null);
    } catch {
      setLikes(previous.likes);
      setDislikes(previous.dislikes);
      setVote(previous.vote);
      setError('No connection. Try again.');
    } finally {
      setBusy(null);
    }
  }

  function applyVoteLocally(value: 'LIKE' | 'DISLIKE' | 'NONE') {
    let nextLikes = likes;
    let nextDislikes = dislikes;
    if (vote === 'LIKE') nextLikes -= 1;
    if (vote === 'DISLIKE') nextDislikes -= 1;
    if (value === 'LIKE') nextLikes += 1;
    if (value === 'DISLIKE') nextDislikes += 1;
    setLikes(Math.max(nextLikes, 0));
    setDislikes(Math.max(nextDislikes, 0));
    setVote(value === 'NONE' ? null : value);
  }

  async function toggleSave() {
    if (requireSignIn(`save ${sourceName}`)) return;
    if (busy) return;

    const previous = saved;
    setBusy('save');
    setError(null);
    setSaved(!previous);

    try {
      const response = await fetch(`/api/sources/${sourceId}/save`, {
        method: previous ? 'DELETE' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: previous ? undefined : JSON.stringify({}),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setSaved(previous);
        setError(body?.error?.message ?? 'That did not save.');
        return;
      }

      // Keeps the Saved count in the header honest without a full reload.
      startTransition(() => router.refresh());
    } catch {
      setSaved(previous);
      setError('No connection. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-0 sm:gap-1.5">
      <button
        type="button"
        onClick={() => void castVote('LIKE')}
        disabled={busy !== null}
        aria-pressed={vote === 'LIKE'}
        aria-label={vote === 'LIKE' ? `Remove your like from ${sourceName}` : `Like ${sourceName}`}
        className={`cl-touch cl-pill cl-vote flex h-11 w-11 flex-col items-center justify-center gap-0 rounded-pill border-2 text-xs font-bold tabular-nums disabled:opacity-60 sm:h-8 sm:w-auto sm:min-w-[58px] sm:flex-row sm:gap-1.5 sm:px-2 sm:py-1.5 ${
          vote === 'LIKE'
            ? 'cl-voted border-selected bg-selected text-selected-fg shadow-pop-red'
            : 'border-line bg-bg text-text hover:border-accent hover:bg-accent-soft hover:text-accent'
        }`}
      >
        {/* Filled once it is yours, so the state reads without colour. */}
        <ThumbsUp
          aria-hidden="true"
          className="h-3.5 w-3.5"
          fill={vote === 'LIKE' ? 'currentColor' : 'none'}
        />
        {likes}
      </button>

      {showDislike ? (
        <button
          type="button"
          onClick={() => void castVote('DISLIKE')}
          disabled={busy !== null}
          aria-pressed={vote === 'DISLIKE'}
          aria-label={
            vote === 'DISLIKE' ? `Remove your dislike from ${sourceName}` : `Dislike ${sourceName}`
          }
          /* Hidden on the narrowest screens to keep the row compact; the
             source page always offers it. */
          className={`cl-touch cl-pill cl-vote hidden h-8 w-auto min-w-[52px] items-center justify-center gap-1.5 rounded-pill border-2 px-2 py-1.5 text-xs font-bold tabular-nums disabled:opacity-60 sm:flex ${
            vote === 'DISLIKE'
              ? 'cl-voted border-voted-line bg-voted-bg text-voted-text'
              : 'border-line bg-bg text-muted hover:border-voted-line hover:bg-voted-bg hover:text-voted-text'
          }`}
        >
          <ThumbsDown
            aria-hidden="true"
            className="h-3.5 w-3.5"
            fill={vote === 'DISLIKE' ? 'currentColor' : 'none'}
          />
          {dislikes}
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => void toggleSave()}
        disabled={busy !== null}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${sourceName} from saved` : `Save ${sourceName}`}
        className={`cl-touch cl-pill cl-vote flex h-11 w-11 items-center justify-center rounded-full border-2 p-1.5 disabled:opacity-60 sm:h-8 sm:w-8 ${
          saved
            ? 'cl-voted border-accent bg-accent-soft text-accent'
            : 'border-transparent text-muted hover:border-accent hover:bg-accent-soft hover:text-accent'
        }`}
      >
        {saved ? (
          <BookmarkCheck aria-hidden="true" className="h-4 w-4" fill="currentColor" />
        ) : (
          <Bookmark aria-hidden="true" className="h-4 w-4" />
        )}
      </button>

      {error ? (
        <span role="alert" className="ml-1 hidden max-w-28 text-xs text-accent sm:inline">
          {error}
        </span>
      ) : null}
    </div>
  );
}
