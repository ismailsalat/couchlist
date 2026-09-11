import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { WatchSourceAdmin } from "@/components/watch-source-admin";
import { currentUser } from "@/lib/auth/session";
import { isTrustedOperator } from "@/lib/api/guards";
import { repos } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DevWatchSourcesPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  if (!isTrustedOperator(user.discordId)) redirect("/private-testing");

  const { watchSources } = repos();
  const sources = await watchSources.listSources({ limit: 100 });
  const [stats, candidates, reports] = await Promise.all([
    watchSources.sourceStats(sources.map((source) => source.id), null),
    watchSources.pendingCandidates(100),
    watchSources.openReports(100),
  ]);

  return (
    <>
      <Nav avatarUrl={user.avatarUrl} username={user.username} />
      <main className="mobile-page-shell mx-auto max-w-5xl px-5 pb-20">
        <header className="mt-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-secondary">Dev tools</p>
          <h1 className="font-display mt-1 text-2xl font-bold">Watch Sources</h1>
          <p className="muted mt-2 max-w-2xl">Quick add one source, review community suggestions, handle simple reports, or use bulk import only when you need it.</p>
        </header>
        <WatchSourceAdmin
          initialSources={sources.map((source) => ({ ...source, stats: stats.get(source.id) ?? null }))}
          initialCandidates={candidates.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))}
          initialReports={reports.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))}
        />
      </main>
    </>
  );
}
