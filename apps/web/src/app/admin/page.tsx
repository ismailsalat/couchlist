import Link from 'next/link';
import { repos } from '@/lib/db';
import { mailTransport } from '@/lib/mail/transport';
import { explainMailFailure, lastMailFailure } from '@/lib/mail/health';

export const dynamic = 'force-dynamic';

/** Admin overview: what is waiting, and nothing else. */
export default async function AdminHomePage() {
  const { contributions, guides, sources } = repos();

  const [pendingSuggestions, openReports, pendingGuides, allSources, unreviewedGuides] =
    await Promise.all([
      contributions.pendingCandidateCount(),
      contributions.openReportCount(),
      guides.pendingSuggestionCount(),
      sources.list({ limit: 1, includeHidden: true }),
      guides.listAllForAdmin(),
    ]);

  const neverReviewed = unreviewedGuides.filter((guide) => !guide.lastReviewedAt).length;

  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <Card
        title="Suggestions waiting"
        value={pendingSuggestions}
        href="/admin/suggestions"
        hint="New sources and corrections to review."
      />
      <Card
        title="Sources with open reports"
        value={openReports}
        href="/admin/reports"
        hint="Grouped, so one issue is one piece of work."
      />
      <Card
        title="Guide submissions waiting"
        value={pendingGuides}
        href="/admin/guides"
        hint="Community guides, corrections and broken links."
      />
      <Card
        title="Sources listed"
        value={allSources.total}
        href="/admin/sources"
        hint="Search, edit, hide and restore."
      />

      <MailStatus />

      {neverReviewed > 0 ? (
        <div className="rounded-card border border-warn-line bg-warn-bg p-4 text-sm text-warn-text sm:col-span-2">
          <p className="m-0 font-semibold">{neverReviewed} guides have never been reviewed.</p>
          <p className="m-0 mt-1.5">
            They were seeded from the design reference and their links, platform support and
            pricing have not been checked. Until a review is recorded, each one tells readers it
            has not been verified.{' '}
            <Link href="/admin/guides" className="underline">
              Review them
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Card({
  title,
  value,
  href,
  hint,
}: {
  title: string;
  value: number;
  href: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-card border border-line bg-surface p-4 no-underline hover:bg-hover"
    >
      <p className="m-0 text-sm text-muted">{title}</p>
      <p className="m-0 mt-1 text-2xl font-semibold tabular-nums text-text">{value}</p>
      <p className="m-0 mt-1.5 text-sm text-muted">{hint}</p>
    </Link>
  );
}

/**
 * Whether verification email is actually working.
 *
 * The failure mode for outbound mail is silence: somebody waits for a code
 * that never comes, and nothing on screen says so. This panel is here so the
 * first person likely to notice — a moderator — can see the provider's own
 * reason without reading server logs.
 */
function MailStatus() {
  const transport = mailTransport();
  const failure = lastMailFailure();
  const guidance = failure ? explainMailFailure(failure.detail, failure.status) : null;

  if (transport === 'resend' && !failure) {
    return (
      <div className="rounded-card border border-line bg-surface p-4 text-sm text-muted sm:col-span-2">
        <p className="m-0">
          <span className="font-semibold text-text">Email is configured</span> and the last send
          went through.
        </p>
      </div>
    );
  }

  const tone =
    transport === 'none' || failure
      ? 'border-danger-line bg-danger-bg text-danger-text'
      : 'border-warn-line bg-warn-bg text-warn-text';

  return (
    <div className={`rounded-card border p-4 text-sm sm:col-span-2 ${tone}`}>
      <p className="m-0 font-semibold">
        {transport === 'none'
          ? 'Verification emails are not being sent.'
          : transport === 'log'
            ? 'Verification emails are printed to the log, not sent.'
            : 'The last verification email did not go out.'}
      </p>

      {transport === 'none' ? (
        <p className="m-0 mt-1.5">
          RESEND_API_KEY and MAIL_FROM are not set, so nobody can finish signing up.
        </p>
      ) : null}

      {transport === 'log' ? (
        <p className="m-0 mt-1.5">
          MAIL_TRANSPORT is set to log. The six-digit code appears in the server output instead of
          an inbox. That is fine locally and wrong in production.
        </p>
      ) : null}

      {failure ? (
        <>
          <p className="m-0 mt-1.5">
            Last failure {failure.at.toISOString().replace('T', ' ').slice(0, 16)} UTC
            {failure.status ? ` — the provider answered ${failure.status}` : ''}.
          </p>
          {guidance ? <p className="m-0 mt-1.5 font-semibold">{guidance}</p> : null}
          {failure.detail ? (
            <p className="m-0 mt-1.5 break-words font-mono text-xs opacity-80">{failure.detail}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
