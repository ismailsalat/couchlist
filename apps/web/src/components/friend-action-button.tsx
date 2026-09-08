'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export type FriendshipState = 'none' | 'incoming' | 'outgoing' | 'accepted';
type FriendAction = 'request' | 'accept' | 'remove';

export function FriendActionButton({
  targetUserId,
  state,
  compact = false,
}: {
  targetUserId: string;
  state: FriendshipState;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send(action: FriendAction) {
    if (action === 'remove' && state === 'accepted' && !window.confirm('Remove this Couchlist friend?')) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId, action }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? 'Could not update that friend.');
        return;
      }

      router.refresh();
    });
  }

  const size = compact ? 'px-3 py-1.5 text-xs' : '';

  return (
    <div className="flex flex-col items-end gap-1">
      {state === 'incoming' ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => send('accept')}
            className={`btn-primary ${size}`}
          >
            {pending ? '…' : 'Accept'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => send('remove')}
            className={`btn-secondary ${size}`}
          >
            Decline
          </button>
        </div>
      ) : state === 'none' ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => send('request')}
          className={`btn-primary ${size}`}
        >
          {pending ? '…' : 'Add Friend'}
        </button>
      ) : state === 'outgoing' ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => send('remove')}
          className={`btn-secondary ${size}`}
          title="Cancel friend request"
        >
          {pending ? '…' : 'Requested'}
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => send('remove')}
          className={`btn-secondary ${size}`}
          title="Remove friend"
        >
          {pending ? '…' : 'Friends ✓'}
        </button>
      )}

      {error ? (
        <span className="max-w-52 text-right text-[10px] text-text-secondary">{error}</span>
      ) : null}
    </div>
  );
}
