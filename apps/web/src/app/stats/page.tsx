import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { BarList, HealthBar, MonthlyColumns, StatTile } from '@/components/stats/charts';
import { optionalUser } from '@/lib/api/guards';
import { savedCountFor } from '@/lib/directory/page-data';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Statistics',
  description:
    'How big the directory is, what it covers, how the links are holding up, and what people say about it.',
  alternates: { canonical: '/stats' },
};

/**
 * The directory, counted.
 *
 * Everything here is a count of rows that already exist for another reason:
 * listings, accounts, votes, saves, guides. The only number produced for this
 * page is the visit total, which sits on a listing and is described on the
 * privacy page in the same words it is described here.
 *
 * Public on purpose. A directory that will not say how big it is or how much
 * of it still works is asking to be taken on faith.
 */
export default async function StatsPage() {
  const user = await optionalUser();
  const [savedCount, stats] = await Promise.all([
    savedCountFor(user),
    repos().statistics.directory(),
  ]);

  const { survey } = stats;
  const adBlockerShare =
    survey.adBlockerAnswers > 0
      ? Math.round((survey.adBlockerYes / survey.adBlockerAnswers) * 100)
      : null;

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active={null} />

      <main id="main" className="mx-auto max-w-[980px] px-3.5 pb-8 pt-6 sm:px-6">
        <h1 className="m-0 text-2xl font-bold tracking-tight sm:text-3xl">Statistics</h1>
        <p className="m-0 mt-2 max-w-[62ch] text-base text-muted">
          Everything on this page is a count of things the site already holds. Nothing here is
          measured by watching anybody &mdash; the{' '}
          <Link href="/privacy" className="text-accent">
            privacy page
          </Link>{' '}
          says exactly what is and is not kept.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Websites listed" value={stats.sources} />
          <StatTile label="People with an account" value={stats.accounts} />
          <StatTile
            label="People who contributed"
            value={stats.contributors}
            note="Found or corrected a listing"
          />
          <StatTile label="Guides" value={stats.guides} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel
            title="What the directory covers"
            note="A site that covers two things is counted under both."
          >
            <BarList
              items={stats.byCategory.map((entry) => ({
                label: entry.category,
                value: entry.count,
              }))}
              emptyNote="Nothing is listed yet."
            />
          </Panel>

          <Panel title="Added each month" note="The last twelve months.">
            <MonthlyColumns months={stats.addedByMonth} />
          </Panel>

          <Panel
            title="How the links are holding up"
            note="Checked once a week. A site that stops answering is looked at by a person before anything changes."
          >
            <HealthBar health={stats.health} />
          </Panel>

          <Panel
            title="What people do with it"
            note="Votes and saves are what the ranking is built from."
          >
            <BarList
              items={[
                { label: 'Votes cast', value: stats.votes },
                { label: 'Sources saved', value: stats.saves },
              ]}
              emptyNote="No votes or saves yet."
            />
          </Panel>

          <Panel
            title="Opened most often"
            note="A total per listing. No account, address or session is recorded with it."
          >
            <BarList
              items={stats.mostVisited.map((entry) => ({
                label: entry.name,
                sublabel: entry.domain,
                value: entry.visits,
              }))}
              unit="opens"
              emptyNote="Nobody has opened a listed site yet."
            />
          </Panel>

          <Panel
            title="What people say"
            note={
              survey.answers > 0
                ? `${survey.answers} ${survey.answers === 1 ? 'person has' : 'people have'} answered the one-question survey.`
                : 'Nobody has answered the survey yet.'
            }
          >
            {survey.answers > 0 ? (
              <>
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <StatTile
                    label="Average, out of 5"
                    value={survey.averageEase?.toFixed(1) ?? '—'}
                    note="How easy it was to find something"
                  />
                  <StatTile
                    label="Use an ad blocker"
                    value={adBlockerShare === null ? '—' : `${adBlockerShare}%`}
                    note={
                      survey.adBlockerAnswers > 0
                        ? `${survey.adBlockerAnswers} answered`
                        : 'Nobody answered that part'
                    }
                  />
                </div>
                <BarList
                  items={[5, 4, 3, 2, 1].map((score) => ({
                    label: `${score} out of 5`,
                    value: survey.easeCounts.find((entry) => entry.ease === score)?.count ?? 0,
                  }))}
                  emptyNote="No answers yet."
                />
              </>
            ) : (
              <p className="m-0 text-sm text-muted">
                It appears once, to people signed in, and never again after it is answered or
                dismissed.
              </p>
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <h2 className="m-0 text-lg font-semibold tracking-tight">{title}</h2>
      {note ? <p className="m-0 mt-1 text-sm text-muted">{note}</p> : null}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}
