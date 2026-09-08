'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const STORAGE_KEY = 'couchlist:server';

/**
 * Server selector.
 *
 * Only appears when a user shares more than one Couchlist-enabled server. The
 * last choice is remembered locally so it does not have to be picked again.
 */
export function ServerSelector({
  guilds,
  selected,
  basePath,
}: {
  guilds: Array<{ id: string; name: string }>;
  selected: string | null;
  basePath: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (selected) {
      window.localStorage.setItem(STORAGE_KEY, selected);
      return;
    }
    const remembered = window.localStorage.getItem(STORAGE_KEY);
    if (remembered && guilds.some((guild) => guild.id === remembered)) {
      router.replace(`${basePath}?server=${remembered}`);
    }
  }, [selected, guilds, basePath, router]);

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Server</span>
      <select
        value={selected ?? ''}
        onChange={(event) => {
          const value = event.target.value;
          if (value) window.localStorage.setItem(STORAGE_KEY, value);
          router.push(value ? `${basePath}?server=${value}` : basePath);
        }}
        className="input w-52 py-1.5"
      >
        <option value="">All servers</option>
        {guilds.map((guild) => (
          <option key={guild.id} value={guild.id}>
            {guild.name}
          </option>
        ))}
      </select>
    </label>
  );
}
