import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Flag, PencilLine } from "lucide-react";
import { confidenceWeightedLikeRatio, likeRatio } from "@couchlist/shared";
import { SiteHeader } from "@/components/site-header";
import {
  AdsWarning,
  AvoidWarning,
  CategoryPill,
  QualityBadge,
  StopOctagon,
  TrustedMark,
} from "@/components/ui/category-pill";
import { SourceRowActions } from "@/components/source-row-actions";
import { SimilarSources } from "@/components/similar-sources";
import { ContributorCredits } from "@/components/contributor-credits";
import { SavedNote } from "@/components/saved-note";
import { RecordVisit } from "@/components/record-visit";
import { optionalUser } from "@/lib/api/guards";
import { savedCountFor } from "@/lib/directory/page-data";
import { repos } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * A source's public page.
 *
 * Stable and shareable, and indexable: it renders on the server with real
 * metadata. The destination domain is always shown before the outbound link,
 * so nobody clicks Visit without knowing where they are going. There is no
 * interstitial and no redirect through Couchlist.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const source = await repos().sources.findById(id);
  if (!source) return { title: "Source not found", robots: { index: false } };

  return {
    title: source.name,
    description:
      source.description ??
      `${source.name} (${source.domain}) — a community-listed place for ${source.categories.join(", ").toLowerCase()}.`,
    alternates: { canonical: `/sources/${source.id}` },
    openGraph: {
      title: `${source.name} · Couchlist`,
      description: source.description ?? undefined,
      url: `/sources/${source.id}`,
    },
  };
}

export default async function SourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await optionalUser();
  const { sources, contributions } = repos();

  const source = await sources.findById(id);
  if (!source) notFound();

  const [savedCount, voteState, savedIds, note, credits, revisions, similar] =
    await Promise.all([
      savedCountFor(user),
      sources.voteState(source.id, user?.id),
      user
        ? sources.bookmarkedIds(user.id, [source.id])
        : Promise.resolve(new Set<string>()),
      user ? sources.bookmarkNote(source.id, user.id) : Promise.resolve(null),
      contributions.publicContributions(source.id),
      contributions.revisions(source.id, 5),
      sources.similar(source.id, 5),
    ]);

  const saved = savedIds.has(source.id);
  const canInteract = Boolean(user?.emailVerifiedAt);
  const ratio = likeRatio(voteState);
  const totalVotes = voteState.likes + voteState.dislikes;

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active="discover" />
      <RecordVisit sourceId={source.id} name={source.name} />

      <main
        id="main"
        className="mx-auto max-w-[980px] px-3.5 pb-6 pt-6 sm:px-6"
      >
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
          <Link href="/" className="text-accent no-underline">
            Discover
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{source.name}</span>
        </nav>

        <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              {/*
               * A contributor's uploaded icon, served from Couchlist's own
               * route. It is never hot-linked from the listed site, which
               * would tell that site who is reading about it.
               */}
              {source.hasIcon ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/sources/${source.id}/icon`}
                  alt=""
                  width={48}
                  height={48}
                  decoding="async"
                  className="mt-0.5 h-11 w-11 shrink-0 rounded-[14px] border-2 border-category-line bg-category-bg object-cover shadow-tile sm:h-12 sm:w-12"
                />
              ) : null}

              <div className="min-w-0">
                <h1 className="m-0 flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
                  {source.trustedRank !== null ? (
                    <TrustedMark note={source.trustedNote} />
                  ) : null}
                  {source.name}
                </h1>
                <p className="m-0 mt-1 text-sm text-muted">{source.domain}</p>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {source.qualityLabel ? <QualityBadge label={source.qualityLabel} /> : null}
                  {source.categories.map((category) => (
                    <CategoryPill key={category} category={category} />
                  ))}
                  {source.hasLotsOfAds ? <AdsWarning /> : null}
                  {source.shouldAvoid ? <AvoidWarning reason={source.avoidReason} /> : null}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <SourceRowActions
                sourceId={source.id}
                sourceName={source.name}
                initialLikes={voteState.likes}
                initialDislikes={voteState.dislikes}
                initialVote={voteState.userVote}
                initialSaved={saved}
                canInteract={canInteract}
              />
              {!canInteract ? (
                <p className="m-0 max-w-48 text-right text-xs text-muted">
                  {user ? (
                    <>
                      <Link href="/verify-email" className="text-accent">
                        Verify your email
                      </Link>{" "}
                      to vote.
                    </>
                  ) : (
                    <>
                      <Link
                        href={`/login?next=/sources/${source.id}`}
                        className="text-accent"
                      >
                        Sign in
                      </Link>{" "}
                      to vote and save.
                    </>
                  )}
                </p>
              ) : null}
            </div>
          </div>

          {/*
            * The strong warning sits above the description and above the
            * button, because it is the thing that should change the reader's
            * mind before they act, not a footnote they meet afterwards.
            */}
          {source.shouldAvoid ? (
            <div
              role="note"
              className="mt-4 flex gap-2.5 rounded-card border-2 border-danger-line bg-danger-bg p-3.5 text-sm text-danger-text"
            >
              <StopOctagon className="mt-px h-4 w-4 shrink-0" />
              <p className="m-0">
                <strong className="font-bold">We suggest avoiding this one.</strong>{' '}
                {source.avoidReason ?? 'A moderator marked it as a bad place to send people.'}{' '}
                It stays listed so the warning is here when you look it up.
              </p>
            </div>
          ) : null}

          {source.description ? (
            <p className="mb-0 mt-4 text-sm text-text">{source.description}</p>
          ) : null}

          {/*
            * The destination is spelled out next to the action.
            *
            * On a source we have just told people to avoid, the button stops
            * being the primary one. A bright call to action directly under a
            * warning quietly argues against the warning, and the warning is
            * the part that is true. The link still works: this is advice, not
            * a lock.
            */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href={source.homepageUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={
                source.shouldAvoid
                  ? 'cl-touch inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-muted no-underline hover:bg-hover hover:text-text'
                  : 'cl-touch inline-flex items-center gap-2 rounded-pill bg-selected px-4 py-2.5 text-sm font-semibold text-selected-fg no-underline shadow-primary hover:bg-selected-hover'
              }
            >
              {source.shouldAvoid ? 'Go anyway' : 'Visit website'}
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </a>
            <span className="text-sm text-muted">
              Opens <span className="text-text">{source.domain}</span> in a new
              tab
            </span>
          </div>

          <p className="m-0 mt-4 text-xs text-muted">
            Couchlist lists this website. It does not host, proxy or vouch for
            its content. Consider an{" "}
            <Link href="/guides/ad-blocking" className="text-accent">
              ad blocker
            </Link>{" "}
            and avoid downloads or sign-ins on sites you do not know.
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_260px]">
          <section className="flex flex-col gap-4">
            <div className="rounded-card border border-line bg-surface p-4">
              <h2 className="m-0 text-lg font-semibold">Community feedback</h2>
              {totalVotes > 0 ? (
                <>
                  <p className="m-0 mt-2 text-sm text-text">
                    {voteState.likes} of {totalVotes}{" "}
                    {totalVotes === 1 ? "person" : "people"} found this useful
                    {ratio !== null ? ` (${Math.round(ratio * 100)}%)` : ""}.
                  </p>
                  <p className="m-0 mt-1.5 text-xs text-muted">
                    Recommended ranking uses a confidence-weighted score, so a
                    source with a handful of votes is not placed above a
                    well-established one on percentage alone. This source scores{" "}
                    {Math.round(confidenceWeightedLikeRatio(voteState) * 100)}{" "}
                    out of 100.
                  </p>
                </>
              ) : (
                <p className="m-0 mt-2 text-sm text-muted">
                  No feedback yet. Yours would be the first.
                </p>
              )}
            </div>

            {user ? (
              <SavedNote sourceId={source.id} saved={saved} note={note} />
            ) : null}

            <div className="rounded-card border border-line bg-surface p-4">
              <h2 className="m-0 text-lg font-semibold">Credit</h2>
              <ContributorCredits
                credits={credits.map((entry) => ({
                  id: entry.id,
                  kind: entry.kind,
                  isOriginal: entry.isOriginal,
                  summary: entry.summary,
                  credit: entry.credit,
                }))}
              />

              {revisions.length > 0 ? (
                <>
                  <h3 className="mb-0 mt-4 text-sm font-semibold text-text">
                    Approved updates
                  </h3>
                  <ul className="m-0 mt-1.5 list-none space-y-1 p-0 text-sm text-muted">
                    {revisions.map((revision) => (
                      <li key={revision.id}>
                        {revision.summary}
                        <span className="text-muted">
                          {" "}
                          · {revision.createdAt.toISOString().slice(0, 10)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Link
                href={`/sources/${source.id}/correct`}
                className={secondaryActionClass}
              >
                <PencilLine aria-hidden="true" className="h-4 w-4" />
                Suggest a correction
              </Link>
              <Link
                href={`/sources/${source.id}/report`}
                className={secondaryActionClass}
              >
                <Flag aria-hidden="true" className="h-4 w-4" />
                Report an issue
              </Link>
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <SimilarSources sources={similar} />
          </aside>
        </div>
      </main>
    </>
  );
}

const secondaryActionClass =
  "cl-touch inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3.5 py-2.5 text-sm text-text no-underline hover:bg-hover";
