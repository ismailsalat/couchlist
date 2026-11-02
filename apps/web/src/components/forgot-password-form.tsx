'use client';

import { useState } from 'react';
import { Field, inputClass } from './ui/field';
import { authButtonClass } from './auth-shell';

/**
 * Requests a reset link.
 *
 * The confirmation is the same whether or not the address is registered, so
 * this form cannot be used to find out who has an account.
 */
export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not work. Try again.');
        return;
      }
      if (body.devCode) setDevLink(`/reset-password?token=${encodeURIComponent(body.devCode)}`);
      setSent(true);
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-card border border-line bg-surface p-4 text-sm text-muted">
        <p className="m-0">
          If that address has a Couchlist account, a reset link is on its way. It expires in an
          hour.
        </p>
        {devLink ? (
          <p className="m-0 mt-3">
            Development transport: no email was sent.{' '}
            <a href={devLink} className="text-accent">
              Open the reset link
            </a>
            .
          </p>
        ) : null}
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

      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
      </Field>

      <button type="submit" disabled={busy} className={authButtonClass}>
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}
