'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Field, inputClass } from './ui/field';
import { authButtonClass } from './auth-shell';

/** Sets a new password from a one-time reset token. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');

    if (password !== confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? 'That reset link is no longer valid.');
        return;
      }
      setDone(true);
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="m-0 text-sm text-muted">
          Your password is changed and you have been signed out everywhere else.
        </p>
        <Link href="/login" className={`${authButtonClass} mt-4 no-underline`}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <p role="alert" className="m-0 rounded-field border border-line bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
          {error}
        </p>
      ) : null}

      <Field label="New password" htmlFor="password" hint="At least 12 characters.">
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      <Field label="Confirm new password" htmlFor="confirmPassword">
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      <button type="submit" disabled={busy} className={authButtonClass}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}
