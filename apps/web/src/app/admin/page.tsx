import Link from 'next/link';
import { repos } from '@/lib/db';

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
