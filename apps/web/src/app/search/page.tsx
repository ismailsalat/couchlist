import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MEDIA_TYPE_LABEL,
  mediaPath,
  type MediaSummary,
} from "@couchlist/shared";
import { Nav } from "@/components/nav";
import { SearchBar } from "@/components/search-bar";
import { EmptyState } from "@/components/section";
import { Poster } from "@/components/poster";
import { currentUser } from "@/lib/auth/session";
import {
  getGlobalTrending,
  searchMedia,
  type SearchFilter,
} from "@/lib/services/media";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ value: SearchFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "anime", label: "Anime" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV Shows" },
];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");

  const { q = "", type = "all" } = await searchParams;
  const filter = (FILTERS.find((item) => item.value === type)?.value ??
    "all") as SearchFilter;
  const query = q.trim();

  const [result, discovery] = await Promise.all([
    query ? searchMedia(query, filter) : Promise.resolve(null),
    query ? Promise.resolve(null) : getGlobalTrending(20),
  ]);

  return (
    <>
      <Nav
        avatarUrl={user.avatarUrl}
        username={user.username}
        showSearch={false}
      />

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <div className="mt-6">
          <SearchBar initial={query} />
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <Link
              key={item.value}
              href={`/search?q=${encodeURIComponent(query)}&type=${item.value}`}
              className={
                item.value === filter
                  ? "shrink-0 rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-white"
                  : "shrink-0 rounded-full border border-border px-3.5 py-2 text-xs font-bold text-text-secondary hover:text-text-primary"
              }
            >
              {item.label}
            </Link>
          ))}
        </div>

        {result?.degraded ? (
          <p className="muted mt-5 rounded-lg border border-border bg-card px-4 py-2.5">
            Some results are missing right now. Try again shortly.
          </p>
        ) : null}

        <div className="mt-6">
          {!query ? (
            <DiscoveryStart discovery={discovery} filter={filter} />
          ) : result && result.results.length > 0 ? (
            <ul className="card divide-y divide-border">
              {result.results.map((item) => (
                <li
                  key={`${item.provider}-${item.mediaType}-${item.providerMediaId}`}
                >
                  <Link
                    href={mediaPath(item)}
                    className="flex min-h-[76px] items-center gap-4 px-4 py-3 hover:bg-background/40"
                  >
                    <div className="h-16 w-11 shrink-0 overflow-hidden rounded border border-border bg-background">
                      {item.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.posterUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{item.title}</p>
                      <p className="muted">
                        {MEDIA_TYPE_LABEL[item.mediaType]}
                        {item.year ? ` · ${item.year}` : ""}
                        {item.episodeCount
                          ? ` · ${item.episodeCount} episodes`
                          : ""}
                        {item.runtimeMinutes
                          ? ` · ${item.runtimeMinutes}m`
                          : ""}
                      </p>
                    </div>
                    <span className="muted shrink-0">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>No results for “{query}”.</EmptyState>
          )}
        </div>
      </main>
    </>
  );
}

function DiscoveryStart({
  discovery,
  filter,
}: {
  discovery: Awaited<ReturnType<typeof getGlobalTrending>> | null;
  filter: SearchFilter;
}) {
  if (!discovery) return null;

  const anime = discovery.anime;
  const movies = discovery.moviesAndTv.filter(
    (item) => item.mediaType === "MOVIE",
  );
  const tv = discovery.moviesAndTv.filter((item) => item.mediaType === "TV");

  const rows = [
    { key: "anime", title: "Anime", items: anime },
    { key: "movie", title: "Movies", items: movies },
    { key: "tv", title: "TV Shows", items: tv },
  ].filter((row) => filter === "all" || row.key === filter);

  const hasAnything = rows.some((row) => row.items.length > 0);

  if (!hasAnything) {
    return (
      <EmptyState>
        Popular picks are unavailable right now. You can still search above.
      </EmptyState>
    );
  }

  return (
    <section>
      <div className="mb-5">
        <h1 className="font-display text-xl font-bold">Browse something good</h1>
        <p className="muted mt-1">
          Start with what&apos;s popular, or search for anything above.
        </p>
      </div>
      <div className="space-y-7">
        {rows.map((row) =>
          row.items.length > 0 ? (
            <DiscoveryShelf key={row.key} title={row.title} items={row.items} />
          ) : null,
        )}
      </div>
      {discovery.degraded ? (
        <p className="muted mt-4 text-xs">
          One discovery source is temporarily unavailable, so this may be
          shorter than usual.
        </p>
      ) : null}
    </section>
  );
}

function DiscoveryShelf({
  title,
  items,
}: {
  title: string;
  items: MediaSummary[];
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full bg-[#7fc8ff]"
          aria-hidden="true"
        />
        <h2 className="font-display text-sm font-bold text-[#dce8f6]">
          {title}
        </h2>
      </div>
      <div className="poster-shelf -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {items.slice(0, 6).map((item) => (
          <div
            key={`${item.provider}-${item.mediaType}-${item.providerMediaId}`}
            className="w-[128px] shrink-0 snap-start sm:w-[142px]"
          >
            <Poster
              provider={item.provider}
              mediaType={item.mediaType}
              providerMediaId={item.providerMediaId}
              title={item.title}
              posterUrl={item.posterUrl}
              caption={item.year ? String(item.year) : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
