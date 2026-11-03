'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Globe, Star, Trash2 } from 'lucide-react';

type Mirror = {
  id: string;
  domain: string;
  homepageUrl: string;
  isPrimary: boolean;
  isConfirmed: boolean;
  note: string | null;
};

/**
 * Where a listing can be reached.
 *
 * The control that matters is Promote: a site that moved keeps its votes, its
 * credit and its description, and the reader sees the new address. The old
 * one stays in the list, because these sites come back.
 */
export function MirrorControl({
  sourceId,
  mirrors,
}: {
  sourceId: string;
  mirrors: Mirror[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sources/${sourceId}/mirrors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setError(payload.error?.message ?? 'That did not work.');
        return;
      }
      setUrl('');
      router.refresh();
    } catch {
      setError('That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sm:col-span-2">
      <span className="mb-1 block text-sm text-muted">Addresses</span>

      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {mirrors.map((mirror) => (
          <li
            key={mirror.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-bg px-2.5 py-2"
          >
            <Globe aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 break-all text-sm text-text">{mirror.domain}</span>

            {mirror.isPrimary ? (
              <span className="rounded-pill border border-line bg-active px-2 py-px text-xs text-muted">
                In use
              </span>
            ) : null}
            {!mirror.isConfirmed ? (
              <span
                title={mirror.note ?? undefined}
                className="rounded-pill border border-warn-line bg-warn-bg px-2 py-px text-xs font-semibold text-warn-text"
              >
                Proposed
              </span>
            ) : null}

            {!mirror.isPrimary ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void act({ action: 'promote', mirrorId: mirror.id })}
                title="Show this address to readers and check it from now on"
                className="cl-touch inline-flex items-center gap-1 rounded-pill border border-line bg-surface px-2.5 py-1.5 text-xs text-text hover:bg-hover disabled:opacity-60"
              >
                <Star aria-hidden="true" className="h-3 w-3" />
                Use this
              </button>
            ) : null}

            {!mirror.isPrimary ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void act({ action: 'remove', mirrorId: mirror.id })}
                aria-label={`Remove ${mirror.domain}`}
                className="cl-touch rounded-pill border border-line bg-surface p-1.5 text-muted hover:bg-hover hover:text-danger-text disabled:opacity-60"
              >
                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://another-address.example"
          inputMode="url"
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text"
        />
        <button
          type="button"
          disabled={busy || url.trim() === ''}
          onClick={() => void act({ action: 'add', url })}
          className="cl-touch rounded-pill border border-line bg-surface px-3 py-2 text-sm text-text hover:bg-hover disabled:opacity-50"
        >
          Add address
        </button>
      </div>

      <p className="m-0 mt-1.5 text-xs text-muted">
        A site that moves keeps its votes and credit. Promote the new address rather than deleting
        the listing and starting again.
      </p>

      {error ? (
        <p role="alert" className="m-0 mt-2 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}
