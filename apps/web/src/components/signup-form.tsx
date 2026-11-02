'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field, inputClass } from './ui/field';
import { authButtonClass } from './auth-shell';

/**
 * Account signup.
 *
 * The submit button is disabled while the request is in flight, so a double
 * click cannot create two accounts, and nothing claims success until the
 * server has answered. When the deploy is using the development mail
 * transport, the code is shown on screen and labelled as not emailed, rather
 * than leaving a local signup stuck.
 */
export function SignupForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');

    // Caught here as well as on the server, so the answer is immediate and
    // nobody waits on a round trip to be told they mistyped.
    if (password !== confirmPassword) {
      setConfirmError('Those passwords do not match.');
      return;
    }
    setConfirmError(null);

    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          confirmPassword,
          displayName: String(form.get('displayName') ?? ''),
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not work. Check the details and try again.');
        return;
      }

      /*
       * Sign in with the credentials just entered.
       *
       * Entering the code requires a session, so without this a new account
       * lands on the verification page and is bounced straight to sign-in.
       *
       * Done here rather than by creating a session inside signup, because
       * signup answers identically whether or not the address was already
       * registered — and handing out a session in that case would sign the
       * visitor in as somebody else. Going through the ordinary login
       * endpoint means a taken address only works for whoever knows its
       * password, and reveals nothing that trying to log in would not.
       */
      const signedIn = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!signedIn.ok) {
        setNotice(
          'That address already has an account. Sign in instead, or use "Forgot password" if you need a new one.',
        );
        return;
      }

      if (body.devCode) {
        setDevCode(body.devCode);
        setNotice(null);
        return;
      }

      if (!body.emailDelivered) {
        // Honest: the account exists but no code was sent.
        setNotice(
          'Your account is created, but the verification email could not be sent. Ask the site operator to check the mail configuration.',
        );
        return;
      }

      router.refresh();
      router.push('/verify-email?sent=1');
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (devCode) {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="m-0 text-sm font-semibold text-text">Development mail transport</p>
        <p className="m-0 mt-1.5 text-sm text-muted">
          No email was sent. This deploy has <code className="text-accent">MAIL_TRANSPORT=log</code>,
          so the code is printed to the server log and shown here.
        </p>
        <p className="my-3 text-center text-2xl font-semibold tracking-[0.3em] text-text">
          {devCode}
        </p>
        <Link
          href="/verify-email"
          onClick={() => router.refresh()}
          className={`${authButtonClass} no-underline`}
        >
          Enter this code
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
      {notice ? (
        <p role="alert" className="m-0 rounded-field border border-warn-line bg-warn-bg px-3.5 py-2.5 text-sm text-warn-text">
          {notice}
        </p>
      ) : null}

      <Field label="Display name" htmlFor="displayName" hint="Shown on contributions you choose to credit.">
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          minLength={2}
          maxLength={40}
          autoComplete="nickname"
          className={inputClass}
        />
      </Field>

      <Field label="Email" htmlFor="email" hint="Kept private. Never shown publicly.">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={inputClass}
        />
      </Field>

      <Field label="Password" htmlFor="password" hint="At least 12 characters.">
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={inputClass}
          onChange={() => setConfirmError(null)}
        />
      </Field>

      <Field
        label="Confirm password"
        htmlFor="confirmPassword"
        hint="Type it again, so a typo cannot lock you out."
        error={confirmError ?? undefined}
      >
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={inputClass}
          onChange={() => setConfirmError(null)}
        />
      </Field>

      <button type="submit" disabled={busy} className={authButtonClass}>
        {busy ? 'Creating your account…' : 'Create account'}
      </button>
    </form>
  );
}
