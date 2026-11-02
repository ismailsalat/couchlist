import Link from 'next/link';
import { CreditMode, GUIDE_TOPICS, devicesFromFlags } from '@couchlist/shared';
import { guideLinks, guideSteps } from '@couchlist/db';
import { ReviewActions } from '@/components/admin/review-actions';
import { GuideAdminRow } from '@/components/admin/guide-admin-row';
import { EmptyState } from '@/components/ui/empty-state';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  NEW_GUIDE: 'New guide',
  CORRECTION: 'Correction',
  BROKEN_LINK: 'Broken link report',
};

/**
 * Guides: review community submissions, then edit the published set.
 *
 * Recording a review is its own explicit action, so a displayed "last checked"
 * date always corresponds to somebody actually checking.
 */
export default async function AdminGuidesPage() {
  const { guides, users } = repos();
  const [pending, all] = await Promise.all([guides.pendingSuggestions(), guides.listAllForAdmin()]);

  const submitterIds = [
    ...new Set(pending.map((s) => s.submittedByUserId).filter((id): id is string => Boolean(id))),
  ];
  const submitters = await users.findManyByIds(submitterIds);
  const byId = new Map(submitters.map((user) => [user.id, user]));

  const unreviewed = all.filter((guide) => !guide.lastReviewedAt).length;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2.5 text-lg font-semibold">Submissions waiting</h2>
        {pending.length === 0 ? (
          <div className="rounded-card border border-line bg-surface">
            <EmptyState title="Nothing waiting." />
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {pending.map((suggestion) => {
              const submitter = suggestion.submittedByUserId
                ? byId.get(suggestion.submittedByUserId)
                : undefined;
              return (
                <article key={suggestion.id} className="rounded-card border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="m-0 text-sm font-semibold text-text">
                      {KIND_LABEL[suggestion.kind]} ·{' '}
                      {suggestion.title ?? suggestion.targetGuideId ?? 'guide'}
                    </p>
                    <span className="shrink-0 text-xs text-muted">
                      {suggestion.createdAt.toISOString().slice(0, 10)}
                    </span>
                  </div>

                  {suggestion.topic ? (
                    <p className="m-0 mt-1 text-sm text-muted">
                      Topic: {GUIDE_TOPICS.find((t) => t.topic === suggestion.topic)?.title}
                    </p>
                  ) : null}

                  <p className="m-0 mt-2.5 whitespace-pre-wrap text-sm text-text">
                    {suggestion.body}
                  </p>

                  {Array.isArray(suggestion.links) && suggestion.links.length > 0 ? (
                    <ul className="m-0 mt-2.5 list-none space-y-1 p-0 text-sm">
                      {(suggestion.links as Array<{ label: string; url: string }>).map((link) => (
                        <li key={link.url} className="break-all text-muted">
                          {link.label}: <span className="text-text">{link.url}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <p className="m-0 mt-2.5 text-sm text-muted">
                    From{' '}
                    {submitter?.displayName?.trim() || submitter?.username || 'a deleted account'}
                    {suggestion.creditMode === CreditMode.ANONYMOUS
                      ? ' — asked to be credited publicly as Anonymous'
                      : ''}
                  </p>

                  <ReviewActions
                    endpoint={`/api/admin/guide-suggestions/${suggestion.id}`}
                    approveLabel={suggestion.kind === 'NEW_GUIDE' ? 'Accept as a draft' : 'Accept'}
                  />

                  {suggestion.kind === 'NEW_GUIDE' ? (
                    <p className="m-0 mt-2 text-xs text-muted">
                      Accepting creates an unpublished draft below and credits the contributor.
                      You still write the steps and publish it.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold">Published guides</h2>
          <p className="m-0 text-sm text-muted">
            {all.length} total · {unreviewed} never reviewed
          </p>
        </div>

        {unreviewed > 0 ? (
          <p className="m-0 mb-3 rounded-field border border-warn-line bg-warn-bg px-3.5 py-2.5 text-sm text-warn-text">
            A guide with no recorded review tells readers so. Check its links and platform support,
            then tick &ldquo;I checked the links and claims just now&rdquo; when you save.
          </p>
        ) : null}

        <div className="rounded-card border border-line bg-surface">
          {all.map((guide) => (
            <GuideAdminRow
              key={guide.id}
              guide={{
                id: guide.id,
                slug: guide.slug,
                title: guide.title,
                task: guide.task,
                topic: guide.topic,
                summary: guide.summary,
                steps: guideSteps(guide),
                links: guideLinks(guide),
                note: guide.note,
                costNote: guide.costNote,
                browserNotes: guide.browserNotes,
                devices: devicesFromFlags(guide),
                deviceLabel: guide.deviceLabel,
                keywords: guide.keywords,
                isStarter: guide.isStarter,
                isPublished: guide.isPublished,
                sortOrder: guide.sortOrder,
                lastReviewedAt: guide.lastReviewedAt
                  ? guide.lastReviewedAt.toISOString().slice(0, 10)
                  : null,
              }}
            />
          ))}
        </div>

        <p className="m-0 mt-3 text-sm text-muted">
          Need a new one from scratch?{' '}
          <Link href="/guides/suggest" className="text-accent">
            Use the suggestion form
          </Link>{' '}
          and accept your own submission, so the credit and review trail stay consistent.
        </p>
      </section>
    </div>
  );
}
