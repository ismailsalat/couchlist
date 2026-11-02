'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Leaving, from a page that will not let you go anywhere else.
 *
 * Someone who mistyped their address, or who signed up and changed their
 * mind, needs a way out that is not closing the tab. Signing out clears both
 * the session and the hold.
 */
export function SignOutLink() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.push('/');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={busy}
      className="cl-touch text-accent underline disabled:opacity-60"
    >
      {busy ? 'Signing out…' : 'Use a different address'}
    </button>
  );
}
