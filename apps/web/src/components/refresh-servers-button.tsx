'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RefreshServersButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/me/guilds/refresh', { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as {
        refreshed?: boolean;
        reason?: string | null;
      } | null;
      if (!response.ok) {
        setMessage('Could not refresh servers.');
        return;
      }
      if (payload?.refreshed) setMessage('Servers updated.');
      else if (payload?.reason === 'fresh') setMessage('Servers are already current.');
      else if (payload?.reason === 'discord_unavailable') setMessage('Discord is busy. Your current servers were kept.');
      else setMessage('Server list checked.');
      router.refresh();
    } catch {
      setMessage('Could not reach Couchlist.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => void refresh()}>
        {busy ? 'Refreshing…' : 'Refresh servers'}
      </button>
      {message ? <span className="muted text-xs">{message}</span> : null}
    </div>
  );
}
