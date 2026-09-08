"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaSummary } from "@couchlist/shared";
import { Poster } from "./poster";

type BrowseFilter = "anime" | "movie" | "tv";
type BrowseSort = "trending" | "popular" | "top-rated";
type AnimeBrowseKind = "all" | "series" | "movies";
type BrowsePage = {
  items: MediaSummary[];
  page: number;
  hasMore: boolean;
  degraded: boolean;
};

function identity(item: MediaSummary): string {
  return `${item.provider}:${item.mediaType}:${item.providerMediaId}`;
}

function browseUrl(
  filter: BrowseFilter,
  sort: BrowseSort,
  page: number,
  animeKind: AnimeBrowseKind,
): string {
  const params = new URLSearchParams({
    type: filter,
    sort,
    page: String(page),
  });
  if (filter === "anime") params.set("anime", animeKind);
  return `/api/browse?${params.toString()}`;
}

export function BrowseGrid({
  filter,
  sort,
  animeKind = "all",
  initial,
}: {
  filter: BrowseFilter;
  sort: BrowseSort;
  animeKind?: AnimeBrowseKind;
  initial: BrowsePage;
}) {
  const [items, setItems] = useState(initial.items);
  const [page, setPage] = useState(initial.page);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(initial.degraded);
  const [paused, setPaused] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const requestPage = useCallback(
    async (targetPage: number): Promise<BrowsePage> => {
      const response = await fetch(
        browseUrl(filter, sort, targetPage, animeKind),
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok) throw new Error("browse request failed");
      return (await response.json()) as BrowsePage;
    },
    [animeKind, filter, sort],
  );

  const replaceWithFirstPage = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    setPaused(false);

    try {
      const next = await requestPage(1);
      if (next.items.length > 0) {
        setItems(next.items);
        setPage(next.page);
        setHasMore(next.hasMore);
        setDegraded(next.degraded);
      } else {
        setError("Couldn’t load these picks yet.");
        setPaused(true);
      }
    } catch {
      setError("Couldn’t load these picks yet.");
      setPaused(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [requestPage]);

  const loadMore = useCallback(async (force = false) => {
    if (loadingRef.current || !hasMore || (!force && paused)) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const next = await requestPage(page + 1);
      setItems((current) => {
        const seen = new Set(current.map(identity));
        const additions = next.items.filter((item) => !seen.has(identity(item)));
        return [...current, ...additions];
      });
      setPage(next.page);
      setHasMore(next.hasMore);
      setDegraded(next.degraded);
    } catch {
      // Stop automatic retries until the user taps Retry. This prevents a bad
      // provider minute from causing a loop of background requests.
      setError("More picks didn’t load.");
      setPaused(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, page, paused, requestPage]);

  // If the server-side first request hit a temporary provider problem, retry
  // once in the browser automatically. The user should not have to refresh the
  // whole page just because AniList/TMDB had a bad second.
  useEffect(() => {
    if (!initial.degraded) return;
    const timer = window.setTimeout(() => {
      void replaceWithFirstPage();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [initial.degraded, replaceWithFirstPage]);

  // Native browser infinite loading: no dependency, no scroll listener, and no
  // manual "Load more" button. Already-loaded posters stay mounted when users
  // scroll back up.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || paused || items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore(false);
      },
      { rootMargin: "700px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, items.length, loadMore, paused]);

  if (items.length === 0) {
    return (
      <div className="card px-5 py-10 text-center">
        <div className="text-2xl" aria-hidden="true">
          🍿
        </div>
        <p className="mt-3 font-bold">
          {loading ? "Getting picks…" : "These picks didn’t load yet."}
        </p>
        <p className="muted mt-1">
          Search still works for any title above.
        </p>
        {!loading ? (
          <button
            type="button"
            onClick={() => void replaceWithFirstPage()}
            className="btn-secondary mt-4 min-h-[44px]"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {items.map((item) => (
          <Poster
            key={identity(item)}
            provider={item.provider}
            mediaType={item.mediaType}
            providerMediaId={item.providerMediaId}
            title={item.title}
            posterUrl={item.posterUrl}
            caption={item.year ? String(item.year) : undefined}
          />
        ))}
      </div>

      <div ref={sentinelRef} className="mt-8 flex min-h-14 flex-col items-center justify-center gap-2 pb-2 text-center">
        {loading ? (
          <p className="muted text-sm" aria-live="polite">
            Loading more…
          </p>
        ) : error ? (
          <>
            <p className="text-sm font-semibold text-[#ffb8b8]">{error}</p>
            <button
              type="button"
              onClick={() => {
                setPaused(false);
                void loadMore(true);
              }}
              className="btn-secondary min-h-[44px]"
            >
              Retry
            </button>
          </>
        ) : hasMore ? (
          <p className="muted text-xs">Keep scrolling for more</p>
        ) : (
          <p className="muted text-xs">You reached the end of this list.</p>
        )}

        {degraded && !error ? (
          <p className="muted text-xs">
            This list may be shorter right now. Search still works normally.
          </p>
        ) : null}
      </div>
    </div>
  );
}
