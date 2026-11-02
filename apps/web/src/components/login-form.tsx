'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field, inputClass } from './ui/field';
import { authButtonClass } from './auth-shell';

/**
 * Sign-in.
 *
 * `next` returns the reader to whatever they were doing, so a click on Save
 * while signed out resumes on the right page instead of dropping them on the
 * home page.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? 'That email and password do not match.');
        return;
      }

      router.push(body.emailVerified ? next : '/verify-email');
      router.refresh();
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

      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
      </Field>

      <Field label="Password" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </Field>

      <button type="submit" disabled={busy} className={authButtonClass}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
