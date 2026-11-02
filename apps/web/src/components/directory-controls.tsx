'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowDownWideNarrow, Search } from 'lucide-react';
import { ALL_CATEGORIES, SOURCE_CATEGORIES, type CategoryFilter } from '@couchlist/shared';
import { CategoryIcon } from './ui/category-icon';

/**
 * Search, category pills and sort.
 *
 * All three live in the URL, so a filtered list is shareable and the browser's
 * back button undoes one filter change at a time. Typing replaces the current
 * history entry instead of adding one per keystroke; clicking a pill or
 * changing the sort pushes a new entry, because those are deliberate steps a
 * reader will expect Back to undo.
 */

const SEARCH_DEBOUNCE_MS = 300;

export function DirectoryControls({
  category,
  sort,
  search,
  resultLabel,
}: {
  category: CategoryFilter;
  sort: string;
  search: string;
  resultLabel: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(search);
  const searchInput = useRef<HTMLInputElement>(null);
  const isFirstRender = useRef(true);

  /*
   * Keep the field in step when navigation changes the URL, such as the back
   * button or a cleared filter.
   *
   * Adjusted during render rather than in an effect: React applies this before
   * committing, so there is no flash of the stale value and no second paint.
   */
  const [lastSearch, setLastSearch] = useState(search);
  if (search !== lastSearch) {
    setLastSearch(search);
    setQuery(search);
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (query === search) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query.trim()) next.set('q', query.trim());
      else next.delete('q');
      // A new search is a new list, so go back to the first page.
      next.delete('page');
      router.replace(`?${next.toString()}`, { scroll: false });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, search, params, router]);

  // "/" focuses search, as in the reference.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      searchInput.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function pushParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    router.push(`?${next.toString()}`, { scroll: false });
  }

  const categories: CategoryFilter[] = [ALL_CATEGORIES, ...SOURCE_CATEGORIES];

  return (
    <>
      <label className="flex items-center gap-2.5 rounded-field border-2 border-line bg-surface px-3.5 py-3 text-muted focus-within:border-focus">
        <Search aria-hidden="true" className="h-[17px] w-[17px] shrink-0" />
        <span className="sr-only">Search sources</span>
        <input
          ref={searchInput}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a source…"
          className="w-full min-w-0 border-0 bg-transparent p-0 text-base text-text placeholder:text-muted focus:outline-none"
        />
        <kbd className="hidden rounded-md border border-line bg-bg px-[7px] py-px text-sm sm:inline">
          /
        </kbd>
      </label>

      <div className="my-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Source categories">
          {categories.map((value) => {
            const active = value === category;
            return (
              <button
                key={value}
                type="button"
                data-category={value === ALL_CATEGORIES ? undefined : value}
                aria-pressed={active}
                onClick={() => pushParam('category', value === ALL_CATEGORIES ? null : value)}
                className={`cl-touch cl-pill inline-flex items-center gap-2 rounded-pill border-2 px-3 py-1.5 text-sm font-semibold ${
                  active
                    ? 'border-selected bg-selected text-selected-fg shadow-pop-red'
                    : 'border-line bg-surface text-muted hover:-translate-y-px hover:bg-hover hover:text-text'
                }`}
              >
                {/* The glyph keeps its category colour when the pill is not
                    filled, so the row reads as six distinct things. */}
                <span
                  className={
                    active ? 'text-selected-fg' : 'text-category-text'
                  }
                >
                  <CategoryIcon category={value} className="h-[18px] w-[18px]" />
                </span>
                {value}
              </button>
            );
          })}
        </div>

        <label className="ml-auto flex items-center gap-1.5 text-muted">
          <ArrowDownWideNarrow aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="sr-only">Sort sources</span>
          <select
            value={sort}
            onChange={(event) => pushParam('sort', event.target.value)}
            className="max-w-40 border-0 bg-bg px-0.5 py-1.5 text-sm text-text"
          >
            <option value="recommended">Recommended</option>
            <option value="newest">Newest</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      <div
        aria-hidden="true"
        className="grid grid-cols-[20px_minmax(0,1fr)_44px_44px] items-center gap-2 px-2.5 py-2 text-xs text-muted sm:grid-cols-[28px_minmax(0,1fr)_58px_69px] sm:gap-3 sm:px-4"
      >
        <span className="text-center">#</span>
        <span>Source</span>
        <span className="text-center">Likes</span>
        <span />
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {resultLabel}
      </p>
    </>
  );
}
