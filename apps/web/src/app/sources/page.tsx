import { currentUser } from '@/lib/auth/session';
import { repos } from '@/lib/db';
import { GlobalSourcesDirectory, type GlobalSourceItem } from '@/components/global-sources-directory';
import { PublicNav } from '@/components/public-nav';

export const dynamic = 'force-dynamic';

/** Public directory: browsing never requires Discord authentication. */
export default async function GlobalSourcesPage() {
  const user = await currentUser();
  const repository = repos().watchSources;
  const sources = await repository.listSources({ isEnabled: true, limit: 500 });
  const stats = await repository.sourceStats(sources.map((source) => source.id));

  const items: GlobalSourceItem[] = sources.map((source) => {
    const sourceStats = stats.get(source.id);
    return {
      id: source.id,
      name: source.name,
      domain: source.domain,
      homepageUrl: source.homepageUrl,
      sourceType: source.sourceType,
      accessType: source.accessType,
      supportsAnime: source.supportsAnime,
      supportsMovies: source.supportsMovies,
      supportsTv: source.supportsTv,
      likes: sourceStats?.likes ?? 0,
      dislikes: sourceStats?.dislikes ?? 0,
      likePercent: sourceStats?.likePercent ?? null,
      sentimentScore: sourceStats?.sentimentScore ?? 0,
      reliabilityPercent: sourceStats?.reliabilityPercent ?? null,
      workingRecent: sourceStats?.workingRecent ?? 0,
      brokenRecent: sourceStats?.brokenRecent ?? 0,
      healthStatus: sourceStats?.healthStatus ?? 'HEALTHY',
      discoveredAt: source.discoveredAt?.toISOString() ?? null,
    };
  });

  return (
    <>
      <PublicNav user={user} />
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:pt-14">
        <header className="source-directory-header">
          <p className="sources-doc-kicker">Directory</p>
          <h1 className="font-display mt-2 text-4xl font-bold leading-tight sm:text-5xl">Anime, movies, and TV</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
            Search the Couchlist source registry. Availability can change, so community votes and working reports are shown separately.
          </p>
        </header>
        <GlobalSourcesDirectory sources={items} canVote={Boolean(user)} />
      </main>
    </>
  );
}
