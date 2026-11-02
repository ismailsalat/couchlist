import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CONTRIBUTION_KIND_LABEL } from '@couchlist/shared';
import { SiteHeader } from '@/components/site-header';
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

  const [savedCount, credited, count] = await Promise.all([
    savedCountFor(viewer),
    contributions.publicProfileContributions(userId, 25),
    contributions.publicContributionCount(userId),
  ]);

  const name = profile.displayName?.trim() || profile.username;

  return (
    <>
      <SiteHeader user={viewer} savedCount={savedCount} active={null} />

      <main id="main" className="mx-auto max-w-[760px] px-3.5 pb-8 pt-6 sm:px-6">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden="true"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#a44959] bg-accent-soft text-lg font-semibold text-[#ffc1c8]"
          >
            {profile.avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-full w-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              (name[0] ?? '?').toUpperCase()
            )}
          </span>
          <div>
            <h1 className="m-0 text-xl font-semibold tracking-tight">{name}</h1>
            <p className="m-0 mt-0.5 text-sm text-muted">
              {count} public contribution{count === 1 ? '' : 's'}
            </p>
          </div>
        </div>

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
