'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { mediaPath } from '@couchlist/shared';

interface FriendOption {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Candidate {
  identity: { provider: 'ANILIST' | 'JIKAN' | 'TMDB'; providerMediaId: string; mediaType: 'ANIME' | 'MOVIE' | 'TV' };
  title: string;
  posterUrl: string | null;
  score: number;
  planToWatchCount: number;
  unwatchedCount: number;
}

const TYPES = [
  { value: 'anything', label: 'Anything' },
  { value: 'anime', label: 'Anime' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
] as const;

export function WatchTogetherForm({ friends }: { friends: FriendOption[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState<(typeof TYPES)[number]['value']>('anything');
  const [allowRewatch, setAllowRewatch] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(memberId: string) {
    setSelected((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/watch-together', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userIds: selected, mediaType, allowRewatch }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? 'Something went wrong. Try again.');
        setCandidates(null);
        return;
      }

      const data = (await response.json()) as { candidates: Candidate[] };
      setCandidates(data.candidates);
    });
  }

  return (
    <div className="mt-8">
      <div>
        <p className="muted mb-2">Who&apos;s watching?</p>
        <div className="flex flex-wrap gap-2">
          {friends.map((friend) => (
            <button
              key={friend.id}
              type="button"
              onClick={() => toggle(friend.id)}
              className={
                selected.includes(friend.id)
                  ? 'rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-[0_7px_18px_rgba(91,124,250,.24)]'
                  : 'rounded-full border border-border bg-card px-3.5 py-2 text-xs font-bold text-text-secondary hover:border-primary/60 hover:text-text-primary'
              }
            >
              {friend.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="muted mb-2">What kind?</p>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setMediaType(type.value)}
              className={
                mediaType === type.value
                  ? 'rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-white'
                  : 'rounded-full border border-border px-3.5 py-1.5 text-xs font-bold text-text-secondary hover:text-text-primary'
              }
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-5 flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allowRewatch}
          onChange={(event) => setAllowRewatch(event.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Allow rewatch
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={pending || selected.length === 0}
        className="btn-primary mt-6"
      >
        {pending ? 'Finding…' : 'Find something'}
      </button>

      {error ? <p className="muted mt-4">{error}</p> : null}

      {candidates ? (
        candidates.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-display mb-4 text-lg font-bold">Best Match ✦</h2>
            <ul className="card divide-y divide-border">
              {candidates.map((candidate, index) => (
                <li
                  key={`${candidate.identity.provider}-${candidate.identity.providerMediaId}`}
                  className="flex items-center gap-4 px-4 py-3"
                >
                  <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-background">
                    {candidate.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={candidate.posterUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {index === 0 ? '★ ' : ''}
                      {candidate.title}
                    </p>
                    <p className="muted">
                      {candidate.planToWatchCount} already want to watch it ·{' '}
                      {candidate.unwatchedCount} haven&apos;t watched
                    </p>
                  </div>
                  <Link href={mediaPath(candidate.identity)} className="btn-secondary shrink-0">
                    View
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="card mt-8 px-5 py-10 text-center">
            <p className="muted">
              Nothing matched. Add a few things to your Plan to Watch lists and try again.
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}
