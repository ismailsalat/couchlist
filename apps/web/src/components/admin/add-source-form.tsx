'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SOURCE_CATEGORIES } from '@couchlist/shared';

/**
 * Adding a listing directly.
 *
 * A moderator who already knows a site should not have to suggest it to
 * themselves and then approve their own suggestion. Collapsed by default, so
 * the page still opens as what it mostly is — a list to search and manage.
 */
export function AddSourceForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const categories = SOURCE_CATEGORIES.filter((category) => form.get(category) === 'on');

    if (categories.length === 0) {
      setError('Choose at least one category.');
      return;
    }

    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const response = await fetch('/api/admin/sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          url: String(form.get('url') ?? ''),
          description: String(form.get('description') ?? '') || undefined,
          categories,
          hasLotsOfAds: form.get('hasLotsOfAds') === 'on',
          qualityLabel: String(form.get('qualityLabel') ?? '').trim() || null,
          trustedRank: form.get('trusted') === 'on' ? 100 : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not go through.');
        return;
      }
      setDone(`${body.domain} is listed.`);
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cl-touch mb-2.5 rounded-pill bg-selected px-4 py-2 text-sm font-semibold text-selected-fg hover:bg-selected-hover"
      >
        Add a source
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mb-3 rounded-card border-2 border-line bg-surface p-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-base font-bold">Add a source</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cl-touch rounded-pill border border-line bg-bg px-3 py-1.5 text-sm text-muted hover:bg-hover hover:text-text"
        >
          Close
        </button>
      </div>
      <p className="m-0 mt-1 text-sm text-muted">
        Published straight away. No credit is recorded, because nobody suggested it.
      </p>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Name</span>
          <input name="name" required minLength={2} maxLength={80} className={field} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Website address</span>
          <input name="url" required type="url" placeholder="https://example.com" className={field} />
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-muted">Short description</span>
          <input name="description" maxLength={240} className={field} />
        </label>

        <fieldset className="rounded-field border border-line px-3 pb-2.5 pt-1.5 sm:col-span-2">
          <legend className="px-1 text-sm font-semibold text-text">Categories</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {SOURCE_CATEGORIES.map((category) => (
              <label key={category} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={category}
                  className="h-4 w-4 accent-[var(--cl-selected)]"
                />
                {category}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="text-sm">
          <span className="mb-1 block text-muted">Quality, if worth noting</span>
          <input
            name="qualityLabel"
            maxLength={12}
            list="quality-suggestions"
            placeholder="4K"
            className={field}
          />
          <datalist id="quality-suggestions">
            <option value="4K" />
            <option value="1080p" />
            <option value="HD" />
            <option value="SD" />
            <option value="HQ scans" />
            <option value="Official" />
          </datalist>
        </label>

        <div className="flex flex-col justify-end gap-1.5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="trusted" className="h-4 w-4 accent-[var(--cl-selected)]" />
            Mark as a trusted pick
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="hasLotsOfAds"
              className="h-4 w-4 accent-[var(--cl-selected)]"
            />
            Lots of ads
          </label>
        </div>
      </div>

      {error ? (
        <p role="alert" className="m-0 mt-2.5 rounded-field border border-danger-line bg-danger-bg px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="m-0 mt-2.5 rounded-field border border-line bg-bg px-3 py-2 text-sm text-text">
          {done}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="cl-touch mt-3 rounded-pill bg-selected px-4 py-2 text-sm font-semibold text-selected-fg hover:bg-selected-hover disabled:opacity-60"
      >
        {busy ? 'Adding…' : 'Add and publish'}
      </button>
    </form>
  );
}

const field = 'w-full rounded-field border border-line bg-bg px-3 py-2 text-sm text-text';
