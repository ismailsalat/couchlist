import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CONTRIBUTION_KIND_LABEL, milestonesFor } from '@couchlist/shared';
import { SiteHeader } from '@/components/site-header';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { optionalUser } from '@/lib/api/guards';
import { savedCountFor } from '@/lib/directory/page-data';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * A public contributor profile.
 *
 * Shows only the display name, picture and the contributions that person
 * chose to credit. No email, no saved sources, no private notes, and nothing
 * they asked to keep anonymous — so an anonymous contribution cannot be
 * identified by cross-referencing a profile feed.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId } = await params;
  const user = await repos().accounts.findById(userId);
  if (!user || user.deletedAt) return { title: 'Profile not found', robots: { index: false } };

  const name = user.displayName?.trim() || user.username;
  return {
    title: `${name}'s contributions`,
    description: `Sources and guides ${name} has contributed to Couchlist.`,
    alternates: { canonical: `/u/${userId}` },
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const viewer = await optionalUser();
  const { accounts, contributions } = repos();

  const profile = await accounts.findById(userId);
  if (!profile || profile.deletedAt) notFound();

  const [savedCount, credited, count, totals] = await Promise.all([
    savedCountFor(viewer),
    contributions.publicProfileContributions(userId, 25),
    contributions.publicContributionCount(userId),
    contributions.profileTotals(userId),
  ]);

  const earned = milestonesFor({ ...totals, hasTrustedFind: totals.hasTrustedFind });

  const name = profile.displayName?.trim() || profile.username;

  return (
    <>
      <SiteHeader user={viewer} savedCount={savedCount} active={null} />

      <main id="main" className="mx-auto max-w-[760px] px-3.5 pb-8 pt-6 sm:px-6">
        {/*
          * The header.
          *
          * Through the shared Avatar, so an uploaded picture is served from
          * Couchlist rather than hot-linked from wherever it came from, and
          * big enough to actually be a picture of somebody rather than a
          * favicon with a person in it.
          */}
        <div className="flex flex-wrap items-center gap-4">
          <Avatar
            userId={profile.id}
            displayName={name}
            hasAvatar={Boolean(profile.avatarMime)}
            size="xl"
          />
          <div className="min-w-0">
            <h1 className="m-0 text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
            <p className="m-0 mt-1 text-sm text-muted">
              {count} public contribution{count === 1 ? '' : 's'} &middot; here since{' '}
              {monthAndYear(profile.createdAt)}
            </p>
            {profile.bio ? (
              <p className="m-0 mt-2 max-w-[52ch] text-sm text-text">{profile.bio}</p>
            ) : null}
          </div>
        </div>

        {/*
          * What it added up to.
          *
          * The last number is the one worth having: how many strangers kept
          * something this person found. It is the difference between an
          * account that records what you did and one that shows it mattered.
          */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ProfileFigure label="Sources found" value={totals.sourcesFound} />
          <ProfileFigure label="Corrections" value={totals.correctionsAccepted} />
          <ProfileFigure label="Guides" value={totals.guidesWritten} />
          <ProfileFigure
            label="Saved by others"
            value={totals.savesOfTheirFinds}
            note="Times people kept something they found"
          />
        </div>

        {earned.length > 0 ? (
          <ul className="m-0 mt-4 flex list-none flex-wrap gap-2 p-0">
            {earned.map((milestone) => (
              <li
                key={milestone.id}
                title={milestone.note}
                className="rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-text"
              >
                {milestone.label}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 rounded-card border border-line bg-surface">
          {credited.length > 0 ? (
            <ul className="m-0 list-none p-0">
              {credited.map((entry) => (
                <li key={entry.id} className="border-b border-line p-3.5 last:border-b-0">
                  <p className="m-0 text-sm text-text">
                    {entry.summary ?? CONTRIBUTION_KIND_LABEL[entry.kind]}
                  </p>
                  <p className="m-0 mt-0.5 text-xs text-muted">
                    {entry.isOriginal ? 'Original contributor · ' : ''}
                    {entry.createdAt.toISOString().slice(0, 10)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No public contributions."
              hint="Contributions made anonymously are not listed here."
            />
          )}
        </div>

        <p className="m-0 mt-4 text-xs text-muted">
          Only contributions this person chose to credit appear here.{' '}
          <Link href="/" className="text-accent">
            Browse the directory
          </Link>
        </p>
      </main>
    </>
  );
}

/** One number on a profile, with the sentence that makes it mean something. */
function ProfileFigure({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-3.5">
      <p className="m-0 text-2xl font-bold tabular-nums tracking-tight text-text">
        {value.toLocaleString()}
      </p>
      <p className="m-0 mt-0.5 text-sm text-muted">{label}</p>
      {note ? <p className="m-0 mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

function monthAndYear(at: Date): string {
  return at.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
