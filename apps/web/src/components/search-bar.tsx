'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** The single search entry point. Submits to /search. */
export function SearchBar({ compact = false, initial = '' }: { compact?: boolean; initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [hint, setHint] = useState<string | null>(null);

  // Search runs on submit rather than per keystroke, so Jikan and TMDB are
  // never called while someone is still typing.
  const MIN_LENGTH = 2;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        if (query.length < MIN_LENGTH) {
          setHint(`Type at least ${MIN_LENGTH} characters.`);
          return;
        }
        setHint(null);
        router.push(`/search?q=${encodeURIComponent(query)}`);
      }}
      role="search"
    >
      <input
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search anime, movies, or TV shows..."
        aria-label="Search anime, movies, or TV shows"
        minLength={MIN_LENGTH}
        className={compact ? 'input py-2 text-sm' : 'input'}
      />
      {hint ? (
        <p className="muted mt-1.5" role="status">
          {hint}
        </p>
      ) : null}
    </form>
  );
}
