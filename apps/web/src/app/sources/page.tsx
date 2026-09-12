import { currentUser } from '@/lib/auth/session';
import { repos } from '@/lib/db';
import { GlobalSourcesDirectory, type GlobalSourceItem } from '@/components/global-sources-directory';
import { PublicNav } from '@/components/public-nav';

export const dynamic = 'force-dynamic';

/** Public, community-maintained source registry. Browsing never requires login. */
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
      <main className="catalog-shell mx-auto max-w-6xl px-5 pb-24 pt-7 sm:pt-10">
        <header className="source-directory-header">
          <p className="catalog-kicker">Directory</p>
          <h1 className="font-display mt-1 text-2xl font-black sm:text-3xl">Source Directory</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
            A community-maintained index of places people use for anime, movies, and TV. Filter the directory, vote on useful entries, and report what stops working.
          </p>
        </header>
        <GlobalSourcesDirectory sources={items} canVote={Boolean(user)} />
      </main>
    </>
  );
}
