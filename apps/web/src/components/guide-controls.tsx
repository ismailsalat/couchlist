'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { GUIDE_DEVICE_OPTIONS, GuideDevice } from '@couchlist/shared';

/**
 * Guide search and the device filter.
 *
 * Both live in the URL. The device filter excludes guides whose tool is not
 * supported there, which is why support is stored per platform rather than
 * inferred from an app's name.
 */
export function GuideControls({ search, device }: { search: string; device: GuideDevice }) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(search);
  const input = useRef<HTMLInputElement>(null);
  const first = useRef(true);

  // Follows the URL on back/forward. Adjusted during render, not in an
  // effect, so the stale value never paints.
  const [lastSearch, setLastSearch] = useState(search);
  if (search !== lastSearch) {
    setLastSearch(search);
    setQuery(search);
  }

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (query === search) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query.trim()) next.set('q', query.trim());
      else next.delete('q');
      router.replace(`/guides?${next.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, search, params, router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      input.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="mb-5 flex flex-wrap items-stretch gap-2.5 sm:mb-6">
      <label className="flex min-h-11 flex-1 basis-full items-center gap-2.5 rounded-[13px] border border-line bg-surface px-3.5 py-2.5 text-muted focus-within:border-focus sm:basis-0">
        <Search aria-hidden="true" className="h-[17px] w-[17px] shrink-0" />
        <span className="sr-only">Search guides and tools</span>
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try “manga translator” or “watch on TV”…"
          className="w-full min-w-0 border-0 bg-transparent p-0 text-[13px] text-text placeholder:text-muted focus:outline-none"
        />
        <kbd className="hidden rounded-md border border-line bg-bg px-[7px] py-px text-sm sm:inline">
          /
        </kbd>
      </label>

      <label className="flex items-center gap-2.5 text-sm text-muted">
        <span>I&apos;m using</span>
        <select
          value={device}
          onChange={(event) => {
            const next = new URLSearchParams(params.toString());
            if (event.target.value === GuideDevice.ANY) next.delete('device');
            else next.set('device', event.target.value);
            router.push(`/guides?${next.toString()}`, { scroll: false });
          }}
          className="max-w-50 min-h-11 rounded-xl border border-line bg-surface px-2.5 py-2.5 text-sm text-text"
        >
          {GUIDE_DEVICE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
