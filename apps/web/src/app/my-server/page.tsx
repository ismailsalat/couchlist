import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { RefreshServersButton } from "@/components/refresh-servers-button";
import { currentUser } from "@/lib/auth/session";
import { repos } from "@/lib/db";
import { refreshGuildMembershipsIfStale } from "@/lib/services/guild-membership";

export const dynamic = "force-dynamic";

export default async function MyServerPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  await refreshGuildMembershipsIfStale(user);
  const guilds = await repos().guilds.activeGuildsForUser(user.id);
  if (guilds.length === 1 && guilds[0]) redirect(`/server/${guilds[0].discordId}`);

  return (
    <>
      <Nav avatarUrl={user.avatarUrl} username={user.username} />
      <main className="mx-auto max-w-5xl px-5 pb-20">
        <header className="mt-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-secondary">Your communities</p>
          <h1 className="font-display mt-1 text-3xl font-bold">My Server</h1>
          <p className="muted mt-2 max-w-xl">Jump into a Discord community to see what members watch, who is around, and which sources the server recommends.</p>
          <div className="mt-4"><RefreshServersButton /></div>
          <p className="muted mt-2 text-xs">Couchlist refreshes server membership automatically. Use Refresh servers if you just joined or left one and want the change immediately.</p>
        </header>

        {guilds.length ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {guilds.map((guild) => (
              <Link key={guild.id} href={`/server/${guild.discordId}`} className="community-card rounded-[24px] border border-border bg-card/95 p-4 transition hover:border-primary/50">
                <div className="flex items-center gap-3">
                  {guild.iconUrl ? (<>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={guild.iconUrl} alt="" className="h-14 w-14 rounded-[18px] border border-border object-cover" />
                  </>) : <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-border bg-background font-display text-lg font-bold">{guild.name.slice(0,1).toUpperCase()}</div>}
                  <div className="min-w-0 flex-1"><p className="truncate font-display text-lg font-bold">{guild.name}</p><p className="muted mt-0.5 text-xs">Open server hub →</p></div>
                  <span className="tag tag-community">Discord</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card mt-6 p-6">
            <h2 className="font-display text-lg font-bold">No connected server yet</h2>
            <p className="muted mt-2">Couchlist still works with friends. Once a Discord server connects the bot and your membership is synced, it will appear here.</p>
            <Link href="/friends" className="btn-secondary mt-4">Go to Friends</Link>
          </div>
        )}
      </main>
    </>
  );
}
