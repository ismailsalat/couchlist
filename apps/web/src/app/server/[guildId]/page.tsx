import Link from "next/link";
import { redirect } from "next/navigation";
import { AppError, mediaPath } from "@couchlist/shared";
import { Nav } from "@/components/nav";
import { ServerTabs } from "@/components/server-tabs";
import { ServerSources } from "@/components/server-sources";
import { MediaThumbnail } from "@/components/media-thumbnail";
import { currentUser } from "@/lib/auth/session";
import { requireGuildMember } from "@/lib/api/guards";
import { repos } from "@/lib/db";
import {
  buildGuildPage,
  type GuildMemberPreview,
  type GuildPageData,
  type TitleTally,
} from "@/lib/services/guild";

export const dynamic = "force-dynamic";

export default async function ServerPage({ params }: { params: Promise<{ guildId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/");
  const { guildId } = await params;

  const access = await safeGuildAccess(guildId);
  if (!access) {
    return (
      <>
        <Nav avatarUrl={user.avatarUrl} username={user.username} />
        <main className="mx-auto max-w-5xl px-5 py-16 text-center">
          <p className="muted">You don&apos;t have access to that connected server on Couchlist.</p>
          <Link href="/my-server" className="btn-secondary mt-6">My Server</Link>
        </main>
      </>
    );
  }

  const [page, sourcePosts] = await Promise.all([
    buildGuildPage(access.user.id, access.guildId),
    repos().watchSources.listServerPosts(access.guildId),
  ]);
  if (!page) throw AppError.notFound("server");

  return (
    <>
      <Nav avatarUrl={user.avatarUrl} username={user.username} />
      <main className="mx-auto max-w-5xl px-5 pb-20">
        <Link href="/my-server" className="muted mt-6 inline-flex min-h-[44px] items-center text-sm font-bold hover:text-text-primary">← My Servers</Link>

        <section className="server-hub-hero mt-2 overflow-hidden rounded-[28px] border border-border px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <ServerIcon iconUrl={page.guild.iconUrl} name={page.guild.name} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate font-display text-2xl font-bold sm:text-3xl">{page.guild.name}</h1>
                  <span className="tag tag-community">Community</span>
                </div>
                <p className="muted mt-1">{page.memberCount} Couchlist member{page.memberCount === 1 ? "" : "s"} · watch, rate, and share together</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <StatPill value={String(totalCount(page.currentlyWatching))} label="watching" />
              <StatPill value={String(totalCount(page.wantToWatch))} label="want next" />
              <StatPill value={String(sourcePosts.length)} label="sources" />
            </div>
          </div>
        </section>

        <ServerTabs
          overview={<Overview page={page} />}
          members={<Members page={page} ownUserId={user.id} />}
          sources={
            <ServerSources
              guildDiscordId={page.guild.discordId}
              initialPosts={sourcePosts.map((post) => ({ ...post, createdAt: post.createdAt.toISOString() }))}
            />
          }
        />
      </main>
    </>
  );
}

async function safeGuildAccess(guildId: string) {
  try { return await requireGuildMember(guildId); } catch { return null; }
}

function Overview({ page }: { page: GuildPageData }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-lg font-bold">What {page.guild.name} is into</h2>
        <p className="muted mt-1">Your server&apos;s shared taste, updated from member lists.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <PulseCard title="Watching" items={page.currentlyWatching.slice(0, 4)} />
        <PulseCard title="Top rated" items={page.highestRated.slice(0, 4)} showRating />
        <PulseCard title="Want to watch" items={page.wantToWatch.slice(0, 4)} />
      </div>
      <div className="watch-source-card mt-6 rounded-[22px] border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-bold">Community sources</h3>
            <p className="muted mt-1">Open the Sources tab to see where members recommend watching anime, movies, and TV.</p>
          </div>
          <span className="tag tag-community">Made for your server</span>
        </div>
      </div>
    </div>
  );
}

function Members({ page, ownUserId }: { page: GuildPageData; ownUserId: string }) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-display text-lg font-bold">Members</h2><p className="muted mt-1">See what people in this server are watching.</p></div>
        <Link href="/friends" className="btn-secondary">Find friends</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {page.members.map((member) => <MemberCard key={member.id} member={member} ownProfile={member.id === ownUserId} />)}
      </div>
    </section>
  );
}

function PulseCard({ title, items, showRating = false }: { title: string; items: TitleTally[]; showRating?: boolean }) {
  return (
    <div className="server-pulse-card rounded-[22px] border border-border bg-card/95 p-4">
      <h3 className="font-display text-sm font-bold">{title}</h3>
      {items.length ? (
        <ol className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li key={`${item.provider}-${item.mediaType}-${item.providerMediaId}`}>
              <Link href={mediaPath(item)} className="group flex min-h-[68px] items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-background/55">
                <MediaThumbnail posterUrl={item.posterUrl} mediaType={item.mediaType} title={item.title} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold group-hover:text-white">{item.title}</span>
                  <span className={`tag mt-1 ${item.mediaType === "ANIME" ? "tag-anime" : item.mediaType === "MOVIE" ? "tag-movie" : "tag-tv"}`}>{item.mediaType === "MOVIE" ? "Movie" : item.mediaType === "TV" ? "TV" : "Anime"}</span>
                </span>
                <span className="muted shrink-0 text-xs">{showRating && item.averageRating !== null ? `★ ${item.averageRating.toFixed(1)}` : item.count}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : <p className="muted mt-3 text-xs">Nothing here yet.</p>}
    </div>
  );
}

function MemberCard({ member, ownProfile }: { member: GuildMemberPreview; ownProfile: boolean }) {
  return (
    <Link href={ownProfile ? "/profile" : `/profile/${member.id}`} className="card flex items-center gap-3 px-4 py-4 transition hover:border-primary/50">
      {member.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.avatarUrl} alt="" className="h-11 w-11 rounded-full border border-border object-cover" />
      ) : <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background font-bold">{(member.globalName ?? member.username).slice(0,1).toUpperCase()}</span>}
      <div className="min-w-0"><p className="truncate font-bold">{member.globalName ?? member.username}</p><p className="muted truncate text-xs">{member.watching ? `Watching ${member.watching}` : "No recent watch activity"}</p></div>
    </Link>
  );
}

function ServerIcon({ iconUrl, name }: { iconUrl: string | null; name: string }) {
  if (iconUrl) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={iconUrl} alt="" className="h-16 w-16 rounded-[20px] border border-border object-cover" />
  );
  return <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-border bg-background font-display text-xl font-bold">{name.slice(0,1).toUpperCase()}</div>;
}

function StatPill({ value, label }: { value: string; label: string }) {
  return <span className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-border/90 bg-background/50 px-3 py-1.5 text-xs font-bold"><span className="text-[#8bc8ff]">{value}</span><span className="text-text-secondary">{label}</span></span>;
}

function totalCount(items: TitleTally[]) { return items.reduce((total, item) => total + item.count, 0); }
