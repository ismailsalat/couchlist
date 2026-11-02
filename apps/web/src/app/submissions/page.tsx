import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTRIBUTION_STATUS_LABEL, CreditMode } from '@couchlist/shared';
import { SiteHeader } from '@/components/site-header';
import { CreditModeToggle } from '@/components/credit-mode-toggle';
import { EmptyState } from '@/components/ui/empty-state';
import { savedCountFor } from '@/lib/directory/page-data';
import { requireUserOrLogin } from '@/lib/auth/require-page-user';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My submissions', robots: { index: false } };

/**
 * My submissions.
 *
 * Shows Pending, Approved or Not accepted for everything this account sent,
 * with the moderator's note where one was left. The credit choice is editable
 * here, which is where the submit form says it will be.
 */
export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { submitted } = await searchParams;
  const user = await requireUserOrLogin('/submissions');
  const { contributions, guides } = repos();

  const [savedCount, candidates, reports, guideSuggestions, credited] = await Promise.all([
    savedCountFor(user),
    contributions.candidatesByUser(user.id),
    contributions.reportsByUser(user.id),
    guides.suggestionsByUser(user.id),
    contributions.ownContributions(user.id),
  ]);

  const hasAnything =
    candidates.length > 0 || reports.length > 0 || guideSuggestions.length > 0;

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active="discover" />

      <main id="main" className="mx-auto max-w-[760px] px-3.5 pb-8 pt-6 sm:px-6">
        <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">My submissions</h1>
        <p className="m-0 mb-5 mt-1.5 text-sm text-muted">
          What you have sent, and where it got to.
        </p>

        {submitted ? (
          <p role="status" className="mb-5 rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-muted">
            Thanks — your suggestion is in the review queue.
          </p>
        ) : null}

        {!hasAnything ? (
          <div className="rounded-card border border-line bg-surface">
            <EmptyState
              title="Nothing submitted yet."
              hint="Suggest a source, correct a listing, or write a guide."
              action={
                <Link
                  href="/submit"
                  className="rounded-pill bg-selected px-3.5 py-2 text-sm font-semibold text-selected-fg no-underline"
                >
                  Suggest a source
                </Link>
              }
            />
          </div>
        ) : null}

        {candidates.length > 0 ? (
          <section className="mb-6">
            <h2 className="mb-2.5 text-lg font-semibold">Sources and corrections</h2>
            <ul className="m-0 list-none space-y-2.5 p-0">
              {candidates.map((candidate) => (
                <li key={candidate.id} className="rounded-card border border-line bg-surface p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="m-0 text-sm font-semibold text-text">
                        {candidate.kind === 'CORRECTION' ? 'Correction to ' : ''}
                        {candidate.suggestedName}
                      </p>
                      <p className="m-0 mt-0.5 text-sm text-muted">{candidate.domain}</p>
                    </div>
                    <StatusChip status={candidate.status} />
                  </div>

                  {candidate.reviewNotes ? (
                    <p className="m-0 mt-2.5 text-sm text-muted">
                      <span className="text-text">Moderator:</span> {candidate.reviewNotes}
                    </p>
                  ) : null}

                  {candidate.status === 'APPROVED' && candidate.promotedSourceId ? (
                    <p className="m-0 mt-2.5 text-sm">
                      <Link href={`/sources/${candidate.promotedSourceId}`} className="text-accent">
                        Open the listing
                      </Link>
                    </p>
                  ) : null}

                  <p className="m-0 mt-2.5 text-xs text-muted">
                    Submitted {candidate.createdAt.toISOString().slice(0, 10)} ·{' '}
                    {candidate.creditMode === CreditMode.ANONYMOUS
                      ? 'credited as Anonymous'
                      : 'credited to your account'}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {guideSuggestions.length > 0 ? (
          <section className="mb-6">
            <h2 className="mb-2.5 text-lg font-semibold">Guides</h2>
            <ul className="m-0 list-none space-y-2.5 p-0">
              {guideSuggestions.map((suggestion) => (
                <li key={suggestion.id} className="rounded-card border border-line bg-surface p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="m-0 text-sm font-semibold text-text">
                      {suggestion.title ?? GUIDE_KIND_LABEL[suggestion.kind]}
                    </p>
                    <StatusChip status={suggestion.status} />
                  </div>
                  {suggestion.reviewNotes ? (
                    <p className="m-0 mt-2.5 text-sm text-muted">
                      <span className="text-text">Moderator:</span> {suggestion.reviewNotes}
                    </p>
                  ) : null}
                  <p className="m-0 mt-2.5 text-xs text-muted">
                    {GUIDE_KIND_LABEL[suggestion.kind]} ·{' '}
                    {suggestion.createdAt.toISOString().slice(0, 10)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {reports.length > 0 ? (
          <section className="mb-6">
            <h2 className="mb-2.5 text-lg font-semibold">Reports</h2>
            <ul className="m-0 list-none space-y-2.5 p-0">
              {reports.map(({ report, sourceName }) => (
                <li key={report.id} className="rounded-card border border-line bg-surface p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="m-0 text-sm font-semibold text-text">
                      {sourceName ?? 'A source'} — {REPORT_REASON_LABEL[report.reason] ?? report.reason}
                    </p>
                    <StatusChip status={report.resolvedAt ? 'APPROVED' : 'PENDING'} resolvedLabel />
                  </div>
                  {report.resolutionNote ? (
                    <p className="m-0 mt-2.5 text-sm text-muted">
                      <span className="text-text">Outcome:</span> {report.resolutionNote}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {credited.length > 0 ? (
          <section>
            <h2 className="mb-1.5 text-lg font-semibold">Your public credit</h2>
            <p className="m-0 mb-2.5 text-sm text-muted">
              Change how an approved contribution is credited. Anonymous shows no name and no link
              to your account.
            </p>
            <ul className="m-0 list-none space-y-2.5 p-0">
              {credited.map((contribution) => (
                <li
                  key={contribution.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-3.5"
                >
                  <span className="text-sm text-text">
                    {contribution.summary ?? contribution.kind}
                    {contribution.isOriginal ? ' (original contributor)' : ''}
                  </span>
                  <CreditModeToggle
                    contributionId={contribution.id}
                    creditMode={contribution.creditMode}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}

function StatusChip({
  status,
  resolvedLabel,
}: {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  resolvedLabel?: boolean;
}) {
  const label = resolvedLabel
    ? status === 'APPROVED'
      ? 'Resolved'
      : 'Open'
    : CONTRIBUTION_STATUS_LABEL[status];

  const tone =
    status === 'APPROVED'
      ? 'border-[#466c54] bg-[#2b4037] text-[#b9e1c6]'
      : status === 'REJECTED'
        ? 'border-line bg-active text-muted'
        : 'border-warn-line bg-warn-bg text-warn-text';

  return (
    <span className={`shrink-0 rounded-pill border px-2.5 py-0.5 text-xs ${tone}`}>{label}</span>
  );
}

const GUIDE_KIND_LABEL: Record<string, string> = {
  NEW_GUIDE: 'New guide',
  CORRECTION: 'Guide correction',
  BROKEN_LINK: 'Broken link report',
};

const REPORT_REASON_LABEL: Record<string, string> = {
  BROKEN_LINK: 'Broken link',
  LOTS_OF_ADS: 'Lots of ads',
  OTHER: 'Something else',
};
