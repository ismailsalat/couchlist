'use client';

import { useState, useTransition } from 'react';

/** Privacy settings, on your own profile only. */
export function PrivacyControls({
  initial,
}: {
  initial: {
    profileVisibility: 'MUTUAL_SERVERS' | 'PRIVATE';
    showRatings: boolean;
    showProgress: boolean;
  };
}) {
  const [settings, setSettings] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function save(update: Partial<typeof settings>) {
    const next = { ...settings, ...update };
    setSettings(next);
    startTransition(async () => {
      const response = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(update),
      });
      setMessage(response.ok ? 'Saved.' : 'Could not save that. Try again.');
    });
  }

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-base font-semibold">Privacy</h2>

      <div className="card divide-y divide-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm">Profile visibility</p>
            <p className="muted">Couchlist friends and people in shared connected servers.</p>
          </div>
          <select
            value={settings.profileVisibility}
            disabled={pending}
            onChange={(event) =>
              save({ profileVisibility: event.target.value as 'MUTUAL_SERVERS' | 'PRIVATE' })
            }
            className="input w-44 py-1.5"
          >
            <option value="MUTUAL_SERVERS">Friends & shared servers</option>
            <option value="PRIVATE">Private</option>
          </select>
        </div>

        <Toggle
          label="Show ratings"
          description="Let others see the scores you give."
          checked={settings.showRatings}
          disabled={pending}
          onChange={(showRatings) => save({ showRatings })}
        />

        <Toggle
          label="Show progress"
          description="Let others see your episode progress."
          checked={settings.showProgress}
          disabled={pending}
          onChange={(showProgress) => save({ showProgress })}
        />
      </div>

      {message ? <p className="muted mt-3">{message}</p> : null}

      <form action="/api/auth/logout" method="post" className="mt-6">
        <button type="submit" className="btn-secondary">
          Sign out
        </button>
      </form>
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between px-4 py-3">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="muted block">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-primary"
      />
    </label>
  );
}
