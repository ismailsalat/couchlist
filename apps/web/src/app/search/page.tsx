import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MEDIA_TYPE_LABEL,
  mediaPath,
  type MediaSummary,
} from "@couchlist/shared";
import { BrowseGrid } from "@/components/browse-grid";
import { Nav } from "@/components/nav";
import { Poster } from "@/components/poster";
import { SearchBar } from "@/components/search-bar";
import { EmptyState } from "@/components/section";
import { currentUser } from "@/lib/auth/session";
import {
  getBrowseCatalog,
  getBrowsePage,
  searchMedia,
  type AnimeBrowseKind,
  type BrowseCatalog,
  type BrowseFilter,
  type BrowseSort,
  type SearchFilter,
} from "@/lib/services/media";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ value: SearchFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "anime", label: "Anime" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV Shows" },
];

const SORTS: Array<{ value: BrowseSort; label: string }> = [
  { value: "trending", label: "Trending" },
  { value: "popular", label: "Popular" },
  { value: "top-rated", label: "Top Rated" },
];

const ANIME_KINDS: Array<{ value: AnimeBrowseKind; label: string }> = [
  { value: "all", label: "All Anime" },
  { value: "series", label: "Series" },
  { value: "movies", label: "Movies" },
];

const CATEGORY_NAME: Record<BrowseFilter, string> = {
  anime: "Anime",
  movie: "Movies",
  tv: "TV Shows",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    sort?: string;
    anime?: string;
  }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");

  const {
    q = "",
    type = "all",
    sort = "trending",
    anime = "all",
  } = await searchParams;
  const filter = (FILTERS.find((item) => item.value === type)?.value ??
    "all") as SearchFilter;
  const browseSort = (SORTS.find((item) => item.value === sort)?.value ??
    "trending") as BrowseSort;
  const animeKind = (ANIME_KINDS.find((item) => item.value === anime)?.value ??
    "all") as AnimeBrowseKind;
  const query = q.trim();

  const [result, discovery, browsePage] = await Promise.all([
    query ? searchMedia(query, filter) : Promise.resolve(null),
    !query && filter === "all" ? getBrowseCatalog(12) : Promise.resolve(null),
    !query && filter !== "all"
      ? getBrowsePage(filter as BrowseFilter, browseSort, 1, animeKind)
      : Promise.resolve(null),
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
          <p className="muted mt-2 text-xs">
            Search any title, or choose a category to browse.
          </p>
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

        {!query && filter === "anime" ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {ANIME_KINDS.map((item) => (
              <Link
                key={item.value}
                href={`/search?type=anime&anime=${item.value}&sort=${browseSort}`}
                className={
                  item.value === animeKind
                    ? "shrink-0 rounded-full border border-[#65b9ff]/40 bg-[#65b9ff]/10 px-3 py-1.5 text-xs font-bold text-[#b8ddff]"
                    : "shrink-0 rounded-full border border-border/80 px-3 py-1.5 text-xs font-bold text-text-secondary hover:text-text-primary"
                }
              >
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}

        {!query && filter !== "all" ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {SORTS.map((item) => {
              const animeParam =
                filter === "anime" ? `&anime=${animeKind}` : "";
              return (
                <Link
                  key={item.value}
                  href={`/search?type=${filter}&sort=${item.value}${animeParam}`}
                  className={
                    item.value === browseSort
                      ? "shrink-0 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-[#c6d0ff]"
                      : "shrink-0 rounded-full border border-border/80 px-3 py-1.5 text-xs font-bold text-text-secondary hover:text-text-primary"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ) : null}

        {result?.degraded ? (
          <p className="muted mt-5 rounded-lg border border-border bg-card px-4 py-2.5">
            Some results are missing right now. Try again shortly.
          </p>
        ) : null}

        <div className="mt-6">
          {!query && filter === "all" ? (
            <DiscoveryStart discovery={discovery} />
          ) : !query && filter !== "all" && browsePage ? (
            <CategoryBrowse
              filter={filter as BrowseFilter}
              sort={browseSort}
              animeKind={animeKind}
              initial={browsePage}
            />
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

function DiscoveryStart({ discovery }: { discovery: BrowseCatalog | null }) {
  if (!discovery) return null;

  const animeItems =
    discovery.animeTrending.length > 0
      ? discovery.animeTrending
      : discovery.animePopular;
  const rows = [
    {
      key: "anime",
      title: "Anime Right Now",
      subtitle: "Anime people are into right now.",
      items: animeItems,
      href: "/search?type=anime&anime=all&sort=trending",
    },
    {
      key: "movie",
      title: "Movies Right Now",
      subtitle: "Movies getting attention today.",
      items: discovery.movieTrending,
      href: "/search?type=movie&sort=trending",
    },
    {
      key: "tv",
      title: "TV Right Now",
      subtitle: "Shows people are watching right now.",
      items: discovery.tvTrending,
      href: "/search?type=tv&sort=trending",
    },
  ];
  const hasAnything = rows.some((row) => row.items.length > 0);

  return (
    <section>
      <div className="mb-6">
        <h1 className="font-display text-xl font-bold">Browse or search</h1>
        <p className="muted mt-1 max-w-2xl">
          Scroll through popular picks below, or search the full catalog above.
        </p>
      </div>

      {!hasAnything ? (
        <EmptyState>
          Popular picks could not load right now. Search above still works for
          any title.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {rows.map((row) =>
            row.items.length > 0 ? (
              <DiscoveryShelf
                key={row.key}
                title={row.title}
                subtitle={row.subtitle}
                items={row.items}
                href={row.href}
              />
            ) : null,
          )}
        </div>
      )}

      {discovery.degraded ? (
        <p className="muted mt-5 text-xs">
          One shelf is refreshing. The other categories and search still work
          normally.
        </p>
      ) : null}
    </section>
  );
}

function CategoryBrowse({
  filter,
  sort,
  animeKind,
  initial,
}: {
  filter: BrowseFilter;
  sort: BrowseSort;
  animeKind: AnimeBrowseKind;
  initial: Awaited<ReturnType<typeof getBrowsePage>>;
}) {
  const sortLabel =
    SORTS.find((item) => item.value === sort)?.label ?? "Trending";
  const animeLabel =
    animeKind === "movies"
      ? "Anime Movies"
      : animeKind === "series"
        ? "Anime Series"
        : "Anime";
  const categoryLabel = filter === "anime" ? animeLabel : CATEGORY_NAME[filter];

  return (
    <section>
      <div className="mb-5">
        <h1 className="font-display text-xl font-bold">
          {sortLabel} {categoryLabel}
        </h1>
        <p className="muted mt-1">
          Keep scrolling to browse more. Search above when you want something
          specific.
        </p>
      </div>

      <BrowseGrid
        key={`${filter}:${sort}:${filter === "anime" ? animeKind : "all"}`}
        filter={filter}
        sort={sort}
        animeKind={animeKind}
        initial={initial}
      />
    </section>
  );
}

function DiscoveryShelf({
  title,
  subtitle,
  items,
  href,
}: {
  title: string;
  subtitle: string;
  items: MediaSummary[];
  href: string;
}) {
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full bg-[#7fc8ff]"
              aria-hidden="true"
            />
            <h2 className="font-display text-base font-bold text-[#e4edf7]">
              {title}
            </h2>
          </div>
          <p className="muted mt-1 text-xs">{subtitle}</p>
        </div>
        <Link
          href={href}
          className="shrink-0 text-xs font-bold text-primary hover:text-primary-hover"
        >
          See more →
        </Link>
      </div>

      <div className="poster-shelf -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {items.slice(0, 12).map((item) => (
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
