'use client';

import { useState } from 'react';
import { CreditMode } from '@couchlist/shared';

/**
 * Switches one contribution between credited and anonymous.
 *
 * The server checks that the contribution belongs to the caller, so changing
 * the id in the request does not let anybody rewrite someone else's credit.
 */
export function CreditModeToggle({
  contributionId,
  creditMode,
}: {
  contributionId: string;
  creditMode: CreditMode;
}) {
  const [mode, setMode] = useState(creditMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: CreditMode) {
    if (busy || next === mode) return;
    const previous = mode;
    setBusy(true);
    setError(null);
    setMode(next);

    try {
      const response = await fetch(`/api/contributions/${contributionId}/credit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creditMode: next }),
      });
      if (!response.ok) {
        setMode(previous);
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'That did not save.');
      }
    } catch {
      setMode(previous);
      setError('No connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <label className="sr-only" htmlFor={`credit-${contributionId}`}>
        Public credit
      </label>
      <select
        id={`credit-${contributionId}`}
        value={mode}
        disabled={busy}
        onChange={(event) => void change(event.target.value as CreditMode)}
        className="min-h-11 rounded-pill border border-line bg-bg px-3 py-1.5 text-sm text-text disabled:opacity-60 sm:min-h-0"
      >
        <option value={CreditMode.CREDITED}>Credited</option>
        <option value={CreditMode.ANONYMOUS}>Anonymous</option>
      </select>
      {error ? (
        <span role="alert" className="text-xs text-accent">
          {error}
        </span>
      ) : null}
    </span>
  );
}
