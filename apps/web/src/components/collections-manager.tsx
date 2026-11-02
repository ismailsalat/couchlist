'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field, inputClass } from './ui/field';

/**
 * Creates and manages collections.
 *
 * Public and private are stated plainly next to the toggle, because getting
 * that wrong is the kind of mistake that matters.
 */
export function CollectionsManager({
  collections,
}: {
  collections: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isPublic: boolean;
    itemCount: number;
    url: string;
  }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          description: String(form.get('description') ?? '') || undefined,
          isPublic: form.get('isPublic') === 'on',
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not save.');
        return;
      }
      event.currentTarget.reset();
      router.refresh();
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function togglePublic(collection: (typeof collections)[number]) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/collections/${collection.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: collection.name,
          description: collection.description ?? undefined,
          isPublic: !collection.isPublic,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'That did not save.');
        return;
      }
      router.refresh();
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(collection: (typeof collections)[number]) {
    if (!window.confirm(`Delete “${collection.name}”? The sources themselves are not affected.`)) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/collections/${collection.id}`, { method: 'DELETE' });
      if (!response.ok) {
        setError('That did not delete.');
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
    <div className="flex flex-col gap-5">
      {error ? (
        <p role="alert" className="m-0 rounded-field border border-line bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
          {error}
        </p>
      ) : null}

      {collections.length > 0 ? (
        <ul className="m-0 list-none space-y-2.5 p-0">
          {collections.map((collection) => (
            <li
              key={collection.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-line bg-surface p-3.5"
            >
              <div className="min-w-0">
                <p className="m-0 text-sm font-semibold text-text">
                  <Link href={collection.url} className="text-text no-underline hover:text-accent">
                    {collection.name}
                  </Link>
                  <span
                    className={`ml-2 rounded-pill border px-2 py-px text-xs ${
                      collection.isPublic
                        ? 'border-[#466c54] bg-[#2b4037] text-[#b9e1c6]'
                        : 'border-line bg-active text-muted'
                    }`}
                  >
                    {collection.isPublic ? 'Public' : 'Private'}
                  </span>
                </p>
                <p className="m-0 mt-0.5 text-sm text-muted">
                  {collection.itemCount} source{collection.itemCount === 1 ? '' : 's'}
                  {collection.description ? ` · ${collection.description}` : ''}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void togglePublic(collection)}
                  className={smallButton}
                >
                  Make {collection.isPublic ? 'private' : 'public'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(collection)}
                  className={smallButton}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={create} className="rounded-card border border-line bg-surface p-4" noValidate>
        <h2 className="m-0 mb-3 text-lg font-semibold">New collection</h2>
        <div className="flex flex-col gap-3">
          <Field label="Name" htmlFor="collection-name">
            <input
              id="collection-name"
              name="name"
              required
              minLength={2}
              maxLength={60}
              className={inputClass}
            />
          </Field>
          <Field label="Short description" htmlFor="collection-description" optional>
            <input id="collection-description" name="description" maxLength={300} className={inputClass} />
          </Field>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="isPublic" className="mt-1 h-4 w-4 accent-[var(--cl-selected)]" />
            <span>
              <span className="block text-text">Make this public</span>
              <span className="block text-muted">
                Anyone with the link can see its name, description and the sources in it.
              </span>
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="cl-touch mt-3 inline-flex items-center rounded-pill bg-selected px-3.5 py-2.5 text-sm font-semibold text-selected-fg hover:bg-selected-hover disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Create collection'}
        </button>
      </form>
    </div>
  );
}

const smallButton =
  'cl-touch inline-flex items-center rounded-pill border border-line bg-active px-3 py-2 text-sm text-text hover:bg-hover disabled:opacity-60';
