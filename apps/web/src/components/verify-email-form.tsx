'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field, inputClass } from './ui/field';
import { authButtonClass } from './auth-shell';

/**
 * Email verification.
 *
 * Resend has a server-side cooldown; when it refuses, the message says how
 * long to wait rather than silently doing nothing.
 */
export function VerifyEmailForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const code = String(new FormData(event.currentTarget).get('code') ?? '');
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? 'That code is not correct.');
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

  async function resend() {
    if (resending) return;
    setResending(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/auth/resend-verification', { method: 'POST' });
      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? 'Could not send another code.');
        return;
      }
      if (body.devCode) {
        setDevCode(body.devCode);
        return;
      }
      setNotice(
        body.emailDelivered
          ? 'A new code is on its way.'
          : 'A new code was created but the email could not be sent. Ask the site operator to check the mail configuration.',
      );
    } catch {
      setError('No connection. Try again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <p role="alert" className="m-0 rounded-field border border-line bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="m-0 rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-muted">
          {notice}
        </p>
      ) : null}
      {devCode ? (
        <p role="status" className="m-0 rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-muted">
          Development transport: no email was sent. Your code is{' '}
          <span className="font-semibold tracking-[0.2em] text-text">{devCode}</span>.
        </p>
      ) : null}

      <Field label="Verification code" htmlFor="code" hint="Six digits from the email.">
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          className={`${inputClass} text-center text-xl tracking-[0.4em]`}
        />
      </Field>

      <button type="submit" disabled={busy} className={authButtonClass}>
        {busy ? 'Checking…' : 'Verify email'}
      </button>

      <button
        type="button"
        onClick={() => void resend()}
        disabled={resending}
        className="cl-touch rounded-pill border border-line bg-surface px-4 py-2.5 text-sm text-text hover:bg-hover disabled:opacity-60"
      >
        {resending ? 'Sending…' : 'Send a new code'}
      </button>
    </form>
  );
}
