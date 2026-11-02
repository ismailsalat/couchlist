import { categoriesFromFlags } from '@couchlist/shared';
import { SuggestionGroup } from '@/components/admin/suggestion-group';
import { ReviewActions } from '@/components/admin/review-actions';
import { EmptyState } from '@/components/ui/empty-state';
import { QueueFilters } from '@/components/admin/queue-filters';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The suggestion queue.
 *
 * New-source suggestions are grouped by website: several people suggesting the
 * same site is one decision, not several, and all of them get credited. The
 * moderator picks whichever write-up reads best.
 *
 * Corrections stay per-entry, because each one proposes a different change.
 */
/** Groups stay open until the queue is long enough that scanning beats reading. */
const OPEN_BY_DEFAULT_BELOW = 6;

type Sort = 'suggested' | 'newest' | 'oldest';

export default async function AdminSuggestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? '').trim().toLowerCase();
  const sort: Sort =
    params.sort === 'newest' || params.sort === 'oldest' ? params.sort : 'suggested';

  const { contributions, sources, users } = repos();

  const [groups, allPending] = await Promise.all([
    contributions.pendingSuggestionGroups(),
    contributions.pendingCandidates(),
  ]);

  const allCorrections = allPending.filter((candidate) => candidate.kind === 'CORRECTION');

  /*
   * Searching happens here rather than in SQL. The pending queue is small by
   * nature — anything that grows past a few hundred is a moderation problem
   * rather than a query problem — and matching in one place means the domain,
   * every proposed name and every submitter are all searchable without three
   * more indexes.
   */
  const matches = (haystack: Array<string | null | undefined>) =>
    !query || haystack.some((value) => value?.toLowerCase().includes(query));

  const allGroups = groups.filter((group) =>
    matches([
      group.domain,
      ...group.submissions.flatMap((s) => [s.suggestedName, s.submitterName, s.description]),
    ]),
  );

  const sorted = [...allGroups].sort((a, b) => {
    const newest = (group: (typeof allGroups)[number]) =>
      Math.max(...group.submissions.map((s) => s.createdAt.getTime()));
    if (sort === 'newest') return newest(b) - newest(a);
    if (sort === 'oldest') return newest(a) - newest(b);
    // Default: the websites the most people asked for, first.
    return (
      b.submissions.length - a.submissions.length || newest(a) - newest(b)
    );
  });

  const corrections = allCorrections.filter((candidate) =>
    matches([candidate.domain, candidate.suggestedName, candidate.proposedName, candidate.comment]),
  );

  const duplicates = await Promise.all(
    sorted.map(async (group) => (await sources.findByDomain(group.domain))?.id ?? null),
  );

  const correctionSubmitters = await users.findManyByIds(
    [...new Set(corrections.map((c) => c.submittedByUserId).filter((id): id is string => Boolean(id)))],
  );
  const byId = new Map(correctionSubmitters.map((user) => [user.id, user]));

  const totalWaiting = groups.length + allCorrections.length;
  const totalShown = sorted.length + corrections.length;

  if (totalWaiting === 0) {
    return (
      <div className="rounded-card border-2 border-line bg-surface">
        <EmptyState title="Nothing waiting for review." hint="New suggestions will appear here." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <QueueFilters query={params.q ?? ''} sort={sort} shown={totalShown} total={totalWaiting} />

      {totalShown === 0 ? (
        <div className="rounded-card border-2 border-line bg-surface">
          <EmptyState
            title="Nothing matches that search."
            hint="Try part of a website address, a name, or a submitter."
          />
        </div>
      ) : null}

      {sorted.length > 0 ? (
        <section className="flex flex-col gap-3.5">
          <h2 className="m-0 text-lg font-bold">
            New sources
            <span className="ml-2 text-sm font-normal text-muted">
              {sorted.length} {sorted.length === 1 ? 'website' : 'websites'}
            </span>
          </h2>

          {sorted.map((group, index) => (
            <SuggestionGroup
              key={group.domain}
              domain={group.domain}
              defaultOpen={sorted.length < OPEN_BY_DEFAULT_BELOW}
              alreadyListedId={duplicates[index]}
              submissions={group.submissions.map((submission) => ({
                id: submission.id,
                suggestedName: submission.suggestedName,
                homepageUrl: submission.homepageUrl,
                description: submission.description,
                comment: submission.comment,
                createdAt: submission.createdAt.toISOString(),
                submitterName: submission.submitterName,
                creditMode: submission.creditMode,
                hasIcon: submission.hasIcon,
                categories: categoriesFromFlags(submission),
              }))}
            />
          ))}
        </section>
      ) : null}

      {corrections.length > 0 ? (
        <section className="flex flex-col gap-3.5">
          <h2 className="m-0 text-lg font-bold">Corrections</h2>

          {corrections.map((candidate) => {
            const submitter = candidate.submittedByUserId
              ? byId.get(candidate.submittedByUserId)
              : undefined;
            return (
              <article key={candidate.id} className="rounded-card border-2 border-line bg-surface p-4">
                <p className="m-0 text-sm font-bold text-text">
                  Correction to {candidate.suggestedName}
                </p>
                <p className="m-0 mt-0.5 text-sm text-muted">{candidate.domain}</p>

                <dl className="m-0 mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {candidate.proposedName ? (
                    <div>
                      <dt className="text-muted">Proposed name</dt>
                      <dd className="m-0 text-text">{candidate.proposedName}</dd>
                    </div>
                  ) : null}
                  {candidate.proposedUrl ? (
                    <div>
                      <dt className="text-muted">Proposed address</dt>
                      <dd className="m-0 break-all text-text">{candidate.proposedUrl}</dd>
                    </div>
                  ) : null}
                  {candidate.proposedDescription ? (
                    <div className="sm:col-span-2">
                      <dt className="text-muted">Proposed description</dt>
                      <dd className="m-0 text-text">{candidate.proposedDescription}</dd>
                    </div>
                  ) : null}
                  {Array.isArray(candidate.proposedCategories) ? (
                    <div>
                      <dt className="text-muted">Proposed categories</dt>
                      <dd className="m-0 text-text">
                        {(candidate.proposedCategories as string[]).join(', ')}
                      </dd>
                    </div>
                  ) : null}
                  {candidate.proposedHasLotsOfAds !== null ? (
                    <div>
                      <dt className="text-muted">Ad warning</dt>
                      <dd className="m-0 text-text">
                        {candidate.proposedHasLotsOfAds ? 'set' : 'cleared'}
                      </dd>
                    </div>
                  ) : null}
                  {candidate.comment ? (
                    <div className="sm:col-span-2">
                      <dt className="text-muted">What is wrong</dt>
                      <dd className="m-0 text-text">{candidate.comment}</dd>
                    </div>
                  ) : null}
                  <div className="sm:col-span-2">
                    <dt className="text-muted">Submitted by</dt>
                    <dd className="m-0 text-text">
                      {submitter?.displayName?.trim() || submitter?.username || 'a deleted account'}
                      {candidate.creditMode === 'ANONYMOUS'
                        ? ' — asked to be credited publicly as Anonymous'
                        : ''}
                    </dd>
                  </div>
                </dl>

                <ReviewActions
                  endpoint={`/api/admin/suggestions/${candidate.id}`}
                  approveLabel="Apply correction"
                />
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
