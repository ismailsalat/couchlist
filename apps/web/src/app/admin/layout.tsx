import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { savedCountFor } from '@/lib/directory/page-data';
import { requireAdminPage } from '@/lib/auth/require-page-user';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The admin shell.
 *
 * `requireAdminPage` runs on every admin page because this layout wraps them
 * all. It is not the only check: every admin API route calls `requireAdmin`
 * independently, so hiding a link is never what keeps someone out.
 *
 * Six sections: Needs attention, Sources, Suggestions, Reports, Guides and
 * Import.
 *
 * "Needs attention" leads because it is the only one that fills up on its
 * own. The others wait for somebody to do something; this one grows while
 * nobody is looking, which is exactly why it should be the first thing seen.
 * Account moderation and imports stay out of the everyday workflow.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage();
  const { contributions, guides, sources, icons } = repos();

  const [
    savedCount,
    pendingSuggestions,
    openReports,
    pendingGuides,
    needsAttention,
    pendingPreviews,
  ] = await Promise.all([
    savedCountFor(user),
    contributions.pendingCandidateCount(),
    contributions.openReportCount(),
    guides.pendingSuggestionCount(),
    sources.needingAttention().then((rows) => rows.length),
    icons.pendingPreviewCount(),
  ]);

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active={null} />

      <main id="main" className="mx-auto max-w-[980px] px-3.5 pb-8 pt-6 sm:px-6">
        <h1 className="m-0 text-xl font-semibold tracking-tight sm:text-2xl">Admin</h1>
        <p className="m-0 mt-1.5 text-sm text-muted">
          Signed in as {user.displayName?.trim() || user.username}.
        </p>

        {/*
          * Two groups, not eight equal things.
          *
          * The first group is work waiting to be done and fills up on its own;
          * the second is tools you go to on purpose. Separating them means a
          * glance at this row answers "is there anything to do" without
          * reading every label.
          */}
        <nav aria-label="Admin sections" className="my-5 flex flex-wrap items-center gap-1.5">
          <AdminTab href="/admin/attention" label="Needs attention" count={needsAttention} />
          <AdminTab href="/admin/suggestions" label="Suggestions" count={pendingSuggestions} />
          <AdminTab href="/admin/reports" label="Reports" count={openReports} />
          <AdminTab href="/admin/guides" label="Guides" count={pendingGuides} />
          {/* Only here when there is something to decide: a tab that is always
              empty is clutter on every other page. */}
          {pendingPreviews > 0 ? (
            <AdminTab href="/admin/previews" label="Screenshots" count={pendingPreviews} />
          ) : null}

          <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-line sm:block" />

          <AdminTab href="/admin/sources" label="Sources" />
          <AdminTab href="/admin/import" label="Import" />
          <AdminTab href="/admin/deleted" label="Deleted" />
        </nav>

        {children}
      </main>
    </>
  );
}

function AdminTab({ href, label, count }: { href: string; label: string; count?: number }) {
  return (
    <Link
      href={href}
      className="cl-touch inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3.5 py-2 text-sm text-text no-underline hover:bg-hover"
    >
      {label}
      {count ? (
        <span className="rounded-pill bg-selected px-1.5 py-px text-xs text-selected-fg">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
