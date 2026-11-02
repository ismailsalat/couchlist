'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SOURCE_CATEGORIES, type SourceCategory } from '@couchlist/shared';
import { Field, inputClass } from './ui/field';
import { CreditChoice } from './credit-choice';

/**
 * Suggests a correction to a listing.
 *
 * Only the fields the contributor fills in are sent, so an untouched field is
 * left alone rather than being overwritten with the current value.
 */
export function CorrectionForm({
  sourceId,
  displayName,
  current,
}: {
  sourceId: string;
  displayName: string;
  current: {
    name: string;
    homepageUrl: string;
    description: string | null;
    categories: SourceCategory[];
    hasLotsOfAds: boolean;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeCategories, setChangeCategories] = useState(false);
  const [changeAds, setChangeAds] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      sourceId,
      creditMode: String(form.get('creditMode') ?? 'CREDITED'),
      explanation: String(form.get('explanation') ?? '') || undefined,
    };

    const name = String(form.get('proposedName') ?? '').trim();
    const url = String(form.get('proposedUrl') ?? '').trim();
    const description = String(form.get('proposedDescription') ?? '').trim();

    if (name && name !== current.name) payload.proposedName = name;
    if (url && url !== current.homepageUrl) payload.proposedUrl = url;
    if (description && description !== (current.description ?? '')) {
      payload.proposedDescription = description;
    }
    if (changeCategories) {
      const categories = form.getAll('proposedCategories').map(String);
      if (categories.length === 0) {
        setError('Choose at least one category, or untick the category change.');
        return;
      }
      payload.proposedCategories = categories;
    }
    if (changeAds) {
      payload.proposedHasLotsOfAds = form.get('proposedHasLotsOfAds') === 'on';
    }

    const hasChange = [
      'proposedName',
      'proposedUrl',
      'proposedDescription',
      'proposedCategories',
      'proposedHasLotsOfAds',
    ].some((key) => key in payload);

    if (!hasChange) {
      setError('Change at least one thing before sending.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/sources/correct', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not send.');
        return;
      }
      router.push('/submissions?submitted=1');
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <p role="alert" className="m-0 rounded-field border border-line bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
          {error}
        </p>
      ) : null}

      <p className="m-0 text-sm text-muted">
        Leave anything you are not changing exactly as it is.
      </p>

      <Field label="Name" htmlFor="proposedName">
        <input
          id="proposedName"
          name="proposedName"
          type="text"
          defaultValue={current.name}
          maxLength={80}
          className={inputClass}
        />
      </Field>

      <Field label="Website address" htmlFor="proposedUrl">
        <input
          id="proposedUrl"
          name="proposedUrl"
          type="url"
          defaultValue={current.homepageUrl}
          className={inputClass}
        />
      </Field>

      <Field label="Short description" htmlFor="proposedDescription">
        <input
          id="proposedDescription"
          name="proposedDescription"
          type="text"
          defaultValue={current.description ?? ''}
          maxLength={240}
          className={inputClass}
        />
      </Field>

      <fieldset className="m-0 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-semibold text-text">Categories</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={changeCategories}
            onChange={(event) => setChangeCategories(event.target.checked)}
            className="h-4 w-4 accent-[var(--cl-selected)]"
          />
          Change the categories
        </label>

        {changeCategories ? (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2.5">
            {SOURCE_CATEGORIES.map((category) => (
              <label key={category} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="proposedCategories"
                  value={category}
                  defaultChecked={current.categories.includes(category)}
                  className="h-4 w-4 accent-[var(--cl-selected)]"
                />
                {category}
              </label>
            ))}
          </div>
        ) : (
          <p className="m-0 mt-2 text-sm text-muted">
            Currently: {current.categories.join(', ') || 'none'}
          </p>
        )}
      </fieldset>

      <fieldset className="m-0 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-semibold text-text">Ad warning</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={changeAds}
            onChange={(event) => setChangeAds(event.target.checked)}
            className="h-4 w-4 accent-[var(--cl-selected)]"
          />
          Change the &ldquo;Lots of ads&rdquo; warning
        </label>

        {changeAds ? (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="proposedHasLotsOfAds"
              defaultChecked={current.hasLotsOfAds}
              className="h-4 w-4 accent-[var(--cl-selected)]"
            />
            This source has lots of ads
          </label>
        ) : (
          <p className="m-0 mt-2 text-sm text-muted">
            Currently: {current.hasLotsOfAds ? 'warned' : 'no warning'}
          </p>
        )}
      </fieldset>

      <Field label="What is wrong?" htmlFor="explanation" hint="Helps a moderator check it quickly.">
        <textarea id="explanation" name="explanation" rows={3} maxLength={600} className={inputClass} />
      </Field>

      <CreditChoice displayName={displayName} />

      <button
        type="submit"
        disabled={busy}
        className="cl-touch flex w-full items-center justify-center rounded-pill bg-selected px-4 py-3 text-base font-semibold text-selected-fg shadow-primary hover:bg-selected-hover disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send correction'}
      </button>
    </form>
  );
}
