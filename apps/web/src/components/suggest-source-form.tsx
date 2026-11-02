'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SOURCE_CATEGORIES } from '@couchlist/shared';
import { Field, inputClass } from './ui/field';
import { CreditChoice } from './credit-choice';
import { IconPicker } from './icon-picker';

/**
 * Suggests a new source.
 *
 * The URL is normalised and checked on the server, which also refuses a domain
 * that is already listed or already has a pending suggestion. When it does,
 * the message links to the existing listing rather than just saying no.
 */
export function SuggestSourceForm({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ message: string; sourceId?: string } | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    const categories = form.getAll('categories').map(String);

    if (categories.length === 0) {
      setError('Choose at least one category.');
      return;
    }

    setBusy(true);
    setError(null);
    setDuplicate(null);

    try {
      const response = await fetch('/api/sources/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: String(form.get('url') ?? ''),
          name: String(form.get('name') ?? ''),
          description: String(form.get('description') ?? '') || undefined,
          explanation: String(form.get('explanation') ?? '') || undefined,
          categories,
          creditMode: String(form.get('creditMode') ?? 'CREDITED'),
          icon: String(form.get('icon') ?? '') || undefined,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        if (body?.error?.code === 'CL_DUPLICATE_LIST_ENTRY') {
          setDuplicate({ message: body.error.message, sourceId: body.error.sourceId });
          return;
        }
        setError(body?.error?.message ?? 'That did not send. Check the details and try again.');
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
      {duplicate ? (
        <p role="alert" className="m-0 rounded-field border border-warn-line bg-warn-bg px-3.5 py-2.5 text-sm text-warn-text">
          {duplicate.message}{' '}
          {duplicate.sourceId ? (
            <a href={`/sources/${duplicate.sourceId}`} className="underline">
              Open the existing listing
            </a>
          ) : null}
        </p>
      ) : null}

      <Field label="Website address" htmlFor="url" hint="The home page, for example https://example.com">
        <input id="url" name="url" type="url" required inputMode="url" className={inputClass} />
      </Field>

      <Field label="Name" htmlFor="name">
        <input id="name" name="name" type="text" required maxLength={80} className={inputClass} />
      </Field>

      <Field
        label="Short description"
        htmlFor="description"
        optional
        hint="One line about what it offers."
      >
        <input id="description" name="description" type="text" maxLength={240} className={inputClass} />
      </Field>

      <fieldset className="m-0 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-semibold text-text">Categories</legend>
        <p className="m-0 mb-2.5 text-sm text-muted">Choose every kind of thing it covers.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2.5">
          {SOURCE_CATEGORIES.map((category) => (
            <label key={category} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="categories"
                value={category}
                className="h-4 w-4 accent-[var(--cl-selected)]"
              />
              {category}
            </label>
          ))}
        </div>
      </fieldset>

      <IconPicker />

      <Field
        label="Why is it worth listing?"
        htmlFor="explanation"
        optional
        hint="Helps a moderator decide. Not shown publicly."
      >
        <textarea
          id="explanation"
          name="explanation"
          rows={3}
          maxLength={600}
          className={inputClass}
        />
      </Field>

      <CreditChoice displayName={displayName} />

      <button
        type="submit"
        disabled={busy}
        className="cl-touch flex w-full items-center justify-center rounded-pill bg-selected px-4 py-3 text-base font-semibold text-selected-fg shadow-primary hover:bg-selected-hover disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send suggestion'}
      </button>

      <p className="m-0 text-xs text-muted">
        A moderator reviews suggestions before they appear. If somebody has already suggested this
        website, yours is kept alongside theirs and you are both credited. Couchlist does not fetch
        or scan the address you submit.
      </p>
    </form>
  );
}
