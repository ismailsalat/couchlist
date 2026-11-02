'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GUIDE_TOPICS } from '@couchlist/shared';
import { Field, inputClass, selectClass } from './ui/field';
import { CreditChoice } from './credit-choice';

/**
 * Suggests a guide or tool, or corrects an existing one.
 *
 * Links are optional and validated on the server; a guide with no official
 * link is accepted, because some of the most useful ones are plain checks
 * rather than an app to install.
 */
export function GuideSuggestForm({
  displayName,
  guide,
  kind = 'NEW_GUIDE',
}: {
  displayName: string;
  guide?: { id: string; title: string };
  kind?: 'NEW_GUIDE' | 'CORRECTION' | 'BROKEN_LINK';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    const linkUrl = String(form.get('linkUrl') ?? '').trim();
    const linkLabel = String(form.get('linkLabel') ?? '').trim();
    const links = linkUrl ? [{ label: linkLabel || 'Official page', url: linkUrl }] : [];

    setBusy(true);
    setError(null);

    try {
      const response = guide
        ? await fetch('/api/guides/correct', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              guideId: guide.id,
              kind,
              body: String(form.get('body') ?? ''),
              links,
              creditMode: String(form.get('creditMode') ?? 'CREDITED'),
            }),
          })
        : await fetch('/api/guides/suggest', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              title: String(form.get('title') ?? ''),
              topic: String(form.get('topic') ?? 'WATCHING'),
              body: String(form.get('body') ?? ''),
              links,
              creditMode: String(form.get('creditMode') ?? 'CREDITED'),
            }),
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

      {!guide ? (
        <>
          <Field label="What does it help with?" htmlFor="title" hint="Write it as a task, like “Block ads in Firefox”.">
            <input id="title" name="title" type="text" required minLength={4} maxLength={100} className={inputClass} />
          </Field>

          <Field label="Topic" htmlFor="topic">
            <select id="topic" name="topic" className={selectClass} defaultValue="WATCHING">
              {GUIDE_TOPICS.map((entry) => (
                <option key={entry.topic} value={entry.topic}>
                  {entry.title}
                </option>
              ))}
            </select>
          </Field>
        </>
      ) : null}

      <Field
        label={kind === 'BROKEN_LINK' ? 'Which link is broken?' : 'Steps and details'}
        htmlFor="body"
        hint={
          kind === 'BROKEN_LINK'
            ? 'Say which link, and where it goes now.'
            : 'Plain steps someone can follow. Mention which devices it works on, and anything it cannot do.'
        }
      >
        <textarea id="body" name="body" rows={6} required minLength={10} maxLength={2000} className={inputClass} />
      </Field>

      <fieldset className="m-0 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-semibold text-text">Official link</legend>
        <p className="m-0 mb-3 text-sm text-muted">
          The project&apos;s own site or store page, if there is one. Optional.
        </p>
        <div className="flex flex-col gap-3">
          <Field label="Label" htmlFor="linkLabel" optional>
            <input id="linkLabel" name="linkLabel" type="text" maxLength={60} className={inputClass} />
          </Field>
          <Field label="Address" htmlFor="linkUrl" optional>
            <input id="linkUrl" name="linkUrl" type="url" className={inputClass} />
          </Field>
        </div>
      </fieldset>

      <CreditChoice displayName={displayName} />

      <button
        type="submit"
        disabled={busy}
        className="cl-touch flex w-full items-center justify-center rounded-pill bg-selected px-4 py-3 text-base font-semibold text-selected-fg shadow-primary hover:bg-selected-hover disabled:opacity-60"
      >
        {busy ? 'Sending…' : guide ? 'Send correction' : 'Send guide'}
      </button>

      <p className="m-0 text-xs text-muted">
        A moderator reviews and checks the links before anything is published.
      </p>
    </form>
  );
}
