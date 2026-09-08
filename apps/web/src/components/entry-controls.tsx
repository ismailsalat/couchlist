'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Status = 'WATCHING' | 'COMPLETED' | 'PLAN_TO_WATCH';

const STATUS_LABEL: Record<Status, string> = {
  WATCHING: 'Watching',
  COMPLETED: 'Completed',
  PLAN_TO_WATCH: 'Plan to Watch',
};

export interface EntryState {
  status: Status;
  rating: number | null;
  progress: number | null;
}

/**
 * Status, rating and progress controls for one title.
 *
 * Every change is a server request; failures show the server's message rather
 * than a silent no-op, and the row is re-read afterwards so the UI can never
 * drift from the database.
 */
export function EntryControls({
  media,
  initial,
  supportsProgress,
  episodeCount,
}: {
  media: { provider: string; mediaType: string; providerMediaId: string };
  initial: EntryState | null;
  supportsProgress: boolean;
  episodeCount: number | null;
}) {
  const router = useRouter();
  const [entry, setEntry] = useState<EntryState | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function send(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>) {
    setError(null);
    const response = await fetch('/api/me/list', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ media, ...body }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(payload?.error?.message ?? 'Something went wrong. Try again.');
      return null;
    }
    return (await response.json()) as { entry?: EntryState };
  }

  function setStatus(status: Status) {
    startTransition(async () => {
      const result = await send(entry ? 'PATCH' : 'POST', { status });
      if (result) {
        setEntry((current) => ({ ...(current ?? { rating: null, progress: null }), status }));
        router.refresh();
      }
    });
  }

  function setRating(value: string) {
    const rating = value === '' ? null : Number(value);
    startTransition(async () => {
      const result = await send('PATCH', { rating });
      if (result) {
        setEntry((current) => (current ? { ...current, rating } : current));
        router.refresh();
      }
    });
  }

  function setProgress(value: string) {
    const progress = value === '' ? null : Number.parseInt(value, 10);
    if (progress !== null && Number.isNaN(progress)) return;
    startTransition(async () => {
      const result = await send('PATCH', { progress });
      if (result) {
        setEntry((current) => (current ? { ...current, progress } : current));
        router.refresh();
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await send('DELETE', {});
      if (result) {
        setEntry(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS_LABEL) as Status[]).map((status) => (
          <button
            key={status}
            type="button"
            disabled={pending}
            onClick={() => setStatus(status)}
            className={
              entry?.status === status
                ? 'btn bg-primary px-4 py-2 text-white'
                : 'btn-secondary'
            }
          >
            {STATUS_LABEL[status]}
          </button>
        ))}

        {entry ? (
          <button type="button" disabled={pending} onClick={remove} className="btn-secondary">
            Remove
          </button>
        ) : null}
      </div>

      {entry ? (
        <div className="mt-4 flex flex-wrap items-end gap-5">
          <label className="block">
            <span className="muted mb-1 block">Your rating</span>
            <select
              value={entry.rating ?? ''}
              disabled={pending}
              onChange={(event) => setRating(event.target.value)}
              className="input w-32 py-2"
            >
              <option value="">Not rated</option>
              {Array.from({ length: 19 }, (_, index) => (index + 2) / 2).map((value) => (
                <option key={value} value={value}>
                  {value.toFixed(1)} / 10
                </option>
              ))}
            </select>
          </label>

          {supportsProgress ? (
            <label className="block">
              <span className="muted mb-1 block">
                Episode progress{episodeCount ? ` (of ${episodeCount})` : ''}
              </span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={entry.progress ?? ''}
                disabled={pending}
                onBlur={(event) => setProgress(event.target.value)}
                className="input w-32 py-2"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-secondary">
          {error}
        </p>
      ) : null}
    </div>
  );
}
