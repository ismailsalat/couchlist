'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AvatarPicker } from './avatar-picker';
import { useState } from 'react';
import { Field, inputClass } from './ui/field';

/**
 * Account settings: display name, password and deletion.
 *
 * Deletion is confirmed by password *and* by typing DELETE, because it cannot
 * be undone. What it does is spelled out rather than implied.
 */
export function AccountSettings({
  email,
  displayName,
  emailVerified,
  isAdmin,
  publicContributionCount,
  userId,
  hasAvatar,
}: {
  email: string;
  displayName: string;
  emailVerified: boolean;
  isAdmin: boolean;
  publicContributionCount: number;
  userId: string;
  hasAvatar: boolean;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="m-0 text-lg font-semibold">Email</h2>
        <p className="m-0 mt-1.5 text-sm text-text">{email || 'No email address on this account'}</p>
        <p className="m-0 mt-1 text-sm text-muted">
          {emailVerified ? (
            'Verified. Private to you.'
          ) : (
            <>
              Not verified yet —{' '}
              <Link href="/verify-email" className="text-accent">
                enter your code
              </Link>{' '}
              to vote and contribute.
            </>
          )}
        </p>
        {isAdmin ? (
          <p className="m-0 mt-2.5 text-sm text-accent">
            This account has the administrator role.
          </p>
        ) : null}
        <p className="m-0 mt-2.5 text-sm text-muted">
          {publicContributionCount} public contribution
          {publicContributionCount === 1 ? '' : 's'} credited to your profile.
        </p>
      </section>

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="m-0 mb-3 text-lg font-semibold">Profile picture</h2>
        <AvatarPicker userId={userId} displayName={displayName} hasAvatar={hasAvatar} />
      </section>

      <DisplayNameForm initial={displayName} onSaved={() => router.refresh()} />
      <PasswordForm />
      <DeleteAccountForm />
    </div>
  );
}

function DisplayNameForm({ initial, onSaved }: { initial: string; onSaved: () => void }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch('/api/account/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: value }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not save.');
        return;
      }
      setStatus('Saved.');
      onSaved();
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-card border border-line bg-surface p-4" noValidate>
      <h2 className="m-0 mb-3 text-lg font-semibold">Display name</h2>
      <Field label="Display name" htmlFor="displayName" error={error ?? undefined}>
        <input
          id="displayName"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          minLength={2}
          maxLength={40}
          required
          className={inputClass}
        />
      </Field>
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={busy} className={secondaryButton}>
          {busy ? 'Saving…' : 'Save name'}
        </button>
        {status ? (
          <span role="status" className="text-sm text-muted">
            {status}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: String(form.get('currentPassword') ?? ''),
          newPassword: String(form.get('newPassword') ?? ''),
          confirmPassword: String(form.get('confirmPassword') ?? ''),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not save.');
        return;
      }
      setStatus('Password changed. Other sessions have been signed out.');
      event.currentTarget.reset();
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-card border border-line bg-surface p-4" noValidate>
      <h2 className="m-0 mb-1 text-lg font-semibold">Password</h2>
      <p className="m-0 mb-3 text-sm text-muted">
        Changing it signs you out everywhere else.
      </p>

      {error ? (
        <p role="alert" className="m-0 mb-3 rounded-field border border-line bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="m-0 mb-3 rounded-field border border-line bg-bg px-3.5 py-2.5 text-sm text-muted">
          {status}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <Field label="Current password" htmlFor="currentPassword">
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </Field>
        <Field label="New password" htmlFor="newPassword" hint="At least 12 characters.">
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            className={inputClass}
          />
        </Field>
      </div>

      <button type="submit" disabled={busy} className={`${secondaryButton} mt-3`}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}

function DeleteAccountForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          password: String(form.get('password') ?? ''),
          confirm: String(form.get('confirm') ?? ''),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not work.');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="m-0 text-lg font-semibold">Delete account</h2>
      <p className="m-0 mt-1.5 text-sm text-muted">
        Removes your email, password, display name, picture, saved sources and private notes. This
        cannot be undone.
      </p>
      <p className="m-0 mt-2 text-sm text-muted">
        Contributions that were approved stay in the directory so it does not develop holes, but
        they are shown as Anonymous and are no longer linked to you.
      </p>

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={`${secondaryButton} mt-3`}>
          Delete my account
        </button>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3" noValidate>
          {error ? (
            <p role="alert" className="m-0 rounded-field border border-line bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
              {error}
            </p>
          ) : null}

          <Field label="Your password" htmlFor="delete-password">
            <input
              id="delete-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </Field>
          <Field label="Type DELETE to confirm" htmlFor="delete-confirm">
            <input id="delete-confirm" name="confirm" type="text" required className={inputClass} />
          </Field>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="submit"
              disabled={busy}
              className="cl-touch inline-flex items-center rounded-pill bg-selected px-4 py-2.5 text-sm font-semibold text-selected-fg hover:bg-selected-hover disabled:opacity-60"
            >
              {busy ? 'Deleting…' : 'Permanently delete'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={secondaryButton}>
              Keep my account
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

const secondaryButton =
  'cl-touch inline-flex items-center rounded-pill border border-line bg-active px-3.5 py-2.5 text-sm text-text hover:bg-hover disabled:opacity-60';
