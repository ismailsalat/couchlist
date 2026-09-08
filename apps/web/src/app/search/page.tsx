import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MEDIA_TYPE_LABEL, mediaPath } from '@couchlist/shared';
import { Nav } from '@/components/nav';
import { SearchBar } from '@/components/search-bar';
import { EmptyState } from '@/components/section';
import { currentUser } from '@/lib/auth/session';
import { searchMedia, type SearchFilter } from '@/lib/services/media';

export const dynamic = 'force-dynamic';

const FILTERS: Array<{ value: SearchFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'anime', label: 'Anime' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect('/');

  const { q = '', type = 'all' } = await searchParams;
  const filter = (FILTERS.find((item) => item.value === type)?.value ?? 'all') as SearchFilter;
  const query = q.trim();

  // A provider being down produces a notice, not an error page.
  const result = query ? await searchMedia(query, filter) : null;

  return (
    <>
      <Nav avatarUrl={user.avatarUrl} username={user.username} showSearch={false} />

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <div className="mt-6">
          <SearchBar initial={query} />
        </div>

        <div className="mt-4 flex gap-2">
          {FILTERS.map((item) => (
            <Link
              key={item.value}
              href={`/search?q=${encodeURIComponent(query)}&type=${item.value}`}
              className={
                item.value === filter
                  ? 'rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-white'
                  : 'rounded-full border border-border px-3.5 py-1.5 text-xs text-text-secondary hover:text-text-primary'
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
            <EmptyState>Search for an anime, movie or TV show to get started.</EmptyState>
          ) : result && result.results.length > 0 ? (
            <ul className="card divide-y divide-border">
              {result.results.map((item) => (
                <li key={`${item.provider}-${item.mediaType}-${item.providerMediaId}`}>
                  <Link
                    href={mediaPath(item)}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-background/40"
                  >
                    <div className="h-16 w-11 shrink-0 overflow-hidden rounded border border-border bg-background">
                      {item.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.posterUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="muted">
                        {MEDIA_TYPE_LABEL[item.mediaType]}
                        {item.year ? ` · ${item.year}` : ''}
                        {item.episodeCount ? ` · ${item.episodeCount} episodes` : ''}
                        {item.runtimeMinutes ? ` · ${item.runtimeMinutes}m` : ''}
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
