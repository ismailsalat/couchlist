import Link from 'next/link';
import { redirect } from 'next/navigation';
import { mediaPath } from '@couchlist/shared';
import { Nav } from '@/components/nav';
import { currentUser } from '@/lib/auth/session';
import { requireProfileAccess } from '@/lib/api/guards';
import { compareUsers } from '@/lib/services/compare';

export const dynamic = 'force-dynamic';

/** Taste comparison between the viewer and one other member. */
export default async function ComparePage({ params }: { params: Promise<{ userId: string }> }) {
  const viewer = await currentUser();
  if (!viewer) redirect('/');

  const { userId } = await params;

  let comparison;
  try {
    const { target } = await requireProfileAccess(userId);
    comparison = await compareUsers(viewer, target);
  } catch {
    return (
      <>
        <Nav avatarUrl={viewer.avatarUrl} username={viewer.username} mobileLabel="Compare" />
        <main className="mx-auto max-w-5xl px-5 py-16 text-center">
          <p className="muted">You can only compare with people you share a server with.</p>
          <Link href="/home" className="btn-secondary mt-6">
            Back to home
          </Link>
        </main>
      </>
    );
  }

  const { result } = comparison;
  const viewerName = comparison.viewer.globalName ?? comparison.viewer.username;
  const targetName = comparison.target.globalName ?? comparison.target.username;

  return (
    <>
      <Nav avatarUrl={viewer.avatarUrl} username={viewer.username} mobileLabel="Compare" />

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <h1 className="mt-8 text-xl font-semibold">
          {viewerName} + {targetName}
        </h1>

        {result.status === 'not_enough_data' ? (
          <div className="card mt-8 px-5 py-10 text-center">
            <p className="muted">
              Watch a few more titles before we can calculate your taste match.
            </p>
            <p className="muted mt-2">
              {result.sharedRatedTitles} rated in common · {result.needed} more needed
            </p>
          </div>
        ) : (
          <>
            <div className="card mt-8 px-5 py-8 text-center">
              <p className="text-4xl font-semibold text-primary">{result.matchPercent}%</p>
              <p className="muted mt-2">Taste Match</p>
              <p className="muted mt-1">
                {result.sharedTitles} shared title{result.sharedTitles === 1 ? '' : 's'}
              </p>
            </div>

            {result.bothLoved.length > 0 ? (
              <section className="mt-10">
                <h2 className="mb-4 text-base font-semibold">Both Loved</h2>
                <ul className="card divide-y divide-border">
                  {result.bothLoved.slice(0, 5).map((item) => (
                    <li
                      key={`${item.identity.provider}-${item.identity.providerMediaId}`}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <Link href={mediaPath(item.identity)} className="text-sm hover:underline">
                        {item.title}
                      </Link>
                      <span className="muted">
                        {item.ratingA.toFixed(1)} · {item.ratingB.toFixed(1)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {result.biggestDisagreements.length > 0 ? (
              <section className="mt-10">
                <h2 className="mb-4 text-base font-semibold">Biggest Disagreement</h2>
                <ul className="card divide-y divide-border">
                  {result.biggestDisagreements.slice(0, 3).map((item) => (
                    <li
                      key={`${item.identity.provider}-${item.identity.providerMediaId}`}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <Link href={mediaPath(item.identity)} className="text-sm hover:underline">
                        {item.title}
                      </Link>
                      <span className="muted">
                        {viewerName}: {item.ratingA} · {targetName}: {item.ratingB}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {result.bRecommendsToA.length > 0 ? (
              <section className="mt-10">
                <h2 className="mb-4 text-base font-semibold">{targetName} Recommends</h2>
                <ul className="card divide-y divide-border">
                  {result.bRecommendsToA.slice(0, 5).map((item) => (
                    <li
                      key={`${item.identity.provider}-${item.identity.providerMediaId}`}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <Link href={mediaPath(item.identity)} className="text-sm hover:underline">
                        {item.title}
                      </Link>
                      <span className="muted">Rated {item.rating.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
