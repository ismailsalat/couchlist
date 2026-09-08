"use client";

import { useState } from "react";
import type { MediaSummary } from "@couchlist/shared";
import { Poster } from "./poster";
type BrowseFilter = "anime" | "movie" | "tv";
type BrowseSort = "trending" | "popular" | "top-rated";
type BrowsePage = {
  items: MediaSummary[];
  page: number;
  hasMore: boolean;
  degraded: boolean;
};

function identity(item: MediaSummary): string {
  return `${item.provider}:${item.mediaType}:${item.providerMediaId}`;
}

export function BrowseGrid({
  filter,
  sort,
  initial,
}: {
  filter: BrowseFilter;
  sort: BrowseSort;
  initial: BrowsePage;
}) {
  const [items, setItems] = useState(initial.items);
  const [page, setPage] = useState(initial.page);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(initial.degraded);

  async function loadMore() {
    if (loading || !hasMore) return;

    setLoading(true);
    setError(null);
    try {
      const nextPage = page + 1;
      const response = await fetch(
        `/api/browse?type=${filter}&sort=${sort}&page=${nextPage}`,
        { credentials: "same-origin", cache: "no-store" },
      );

      if (!response.ok) throw new Error("browse request failed");

      const next = (await response.json()) as BrowsePage;
      setItems((current) => {
        const seen = new Set(current.map(identity));
        const additions = next.items.filter((item) => !seen.has(identity(item)));
        return [...current, ...additions];
      });
      setPage(next.page);
      setHasMore(next.hasMore);
      setDegraded(next.degraded);
    } catch {
      setError("Couldn’t load more right now. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="card px-5 py-10 text-center">
        <div className="text-2xl" aria-hidden="true">
          🍿
        </div>
        <p className="mt-3 font-bold">Popular picks are unavailable right now.</p>
        <p className="muted mt-1">Search still works for any title above.</p>
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

      <div className="mt-8 flex flex-col items-center gap-2 pb-2 text-center">
        <p className="muted text-xs">
          Showing {items.length} picks{hasMore ? " · keep browsing when you want more" : ""}
        </p>

        {hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="btn-primary min-h-[48px] min-w-[170px]"
          >
            {loading ? "Loading…" : "Load 20 more"}
          </button>
        ) : (
          <p className="text-sm font-bold text-text-secondary">
            You reached the end of this list.
          </p>
        )}

        {error ? (
          <p className="text-sm font-semibold text-[#ffb8b8]">{error}</p>
        ) : degraded ? (
          <p className="muted text-xs">
            This list may be shorter right now. Search still works normally.
          </p>
        ) : null}
      </div>
    </div>
  );
}
