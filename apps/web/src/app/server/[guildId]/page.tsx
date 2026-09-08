import Link from "next/link";
import { redirect } from "next/navigation";
import { AppError, mediaPath } from "@couchlist/shared";
import { Nav } from "@/components/nav";
import { currentUser } from "@/lib/auth/session";
import { requireGuildMember } from "@/lib/api/guards";
import {
  buildGuildPage,
  type GuildMemberPreview,
  type GuildPageData,
  type TitleTally,
} from "@/lib/services/guild";

export const dynamic = "force-dynamic";

/**
 * Optional community hub unlocked when a server owner connects Couchlist.
 * Keep this page visual and compact: the community's pulse, then its people.
 */
export default async function ServerPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");

  const { guildId } = await params;
  const page = await loadGuildPageData(guildId);

  if (!page) {
    return (
      <>
        <Nav avatarUrl={user.avatarUrl} username={user.username} />
        <main className="mx-auto max-w-5xl px-5 py-16 text-center">
          <p className="muted">
            You don&apos;t have access to that connected server on Couchlist.
          </p>
          <Link href="/home" className="btn-secondary mt-6">
            Back to home
          </Link>
        </main>
      </>
    );
  }

  const watchingCount = totalCount(page.currentlyWatching);
  const wantCount = totalCount(page.wantToWatch);
  const topRating = page.highestRated.find(
    (item) => item.averageRating !== null,
  )?.averageRating;

  // WATCHING is a list status, not literal live presence. Active list watchers
  // are surfaced first; true LIVE stays reserved for future Watch Parties.
  const shownMembers = [...page.members]
    .sort((a, b) => Number(Boolean(b.watching)) - Number(Boolean(a.watching)))
    .slice(0, 6);

  return (
    <>
      <Nav avatarUrl={user.avatarUrl} username={user.username} />

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <Link
          href="/home"
          className="muted mt-6 inline-flex min-h-[44px] items-center text-sm font-bold hover:text-text-primary"
        >
          ← Community Servers
        </Link>

        <section className="server-hub-hero mt-2 overflow-hidden rounded-[28px] border border-border px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <ServerIcon iconUrl={page.guild.iconUrl} name={page.guild.name} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate font-display text-2xl font-bold sm:text-3xl">
                    {page.guild.name}
                  </h1>
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#b8c6ff]">
                    Community
                  </span>
                </div>
                <p className="muted mt-1">
                  {page.memberCount} Couchlist member
                  {page.memberCount === 1 ? "" : "s"} · shared server taste
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              <StatPill value={String(watchingCount)} label="watching" />
              <StatPill value={String(wantCount)} label="want next" />
              {topRating !== undefined && topRating !== null ? (
                <StatPill value={`★ ${topRating.toFixed(1)}`} label="top score" />
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4">
            <h2 className="font-display text-lg font-bold">
              What {page.guild.name} is into
            </h2>
            <p className="muted mt-1">
              A quick look at what people here are watching, rating, and saving.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <PulseCard
              title="Watching"
              accent="green"
              items={page.currentlyWatching.slice(0, 3)}
              empty="Nobody has something in Watching yet."
            />
            <PulseCard
              title="Top rated"
              accent="purple"
              items={page.highestRated.slice(0, 3)}
              showRating
              empty="Ratings will show up here."
            />
            <PulseCard
              title="Want to watch"
              accent="blue"
              items={page.wantToWatch.slice(0, 3)}
              empty="Nothing saved for later yet."
            />
          </div>
        </section>

        <section className="mt-9">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">People here</h2>
              <p className="muted mt-1">
                People with something in Watching appear first.
              </p>
            </div>
            <Link href="/friends" className="btn-secondary">
              Find friends from {page.guild.name}
            </Link>
          </div>

          {shownMembers.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shownMembers.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  ownProfile={member.id === user.id}
                />
              ))}
            </div>
          ) : (
            <div className="card px-5 py-6">
              <p className="font-bold">No Couchlist members to show yet.</p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

async function loadGuildPageData(
  guildId: string,
): Promise<GuildPageData | null> {
  try {
    const access = await requireGuildMember(guildId);
    const page = await buildGuildPage(access.user.id, access.guildId);
    if (!page) throw AppError.notFound("server");
    return page;
  } catch {
    return null;
  }
}

function totalCount(items: TitleTally[]): number {
  return items.reduce((total, item) => total + item.count, 0);
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-border/90 bg-background/50 px-3 py-1.5 text-xs font-bold text-[#dce6f5]">
      <span className="text-[#8bc8ff]">{value}</span>
      <span className="text-text-secondary">{label}</span>
    </span>
  );
}

function PulseCard({
  title,
  items,
  empty,
  showRating = false,
  accent,
}: {
  title: string;
  items: TitleTally[];
  empty: string;
  showRating?: boolean;
  accent: "green" | "purple" | "blue";
}) {
  const accentClass =
    accent === "green"
      ? "bg-[#5bd198]"
      : accent === "purple"
        ? "bg-[#a98bff]"
        : "bg-[#7fc8ff]";

  return (
    <div className="server-pulse-card rounded-[22px] border border-border bg-card/95 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${accentClass}`} />
        <h3 className="font-display text-sm font-bold">{title}</h3>
      </div>

      {items.length > 0 ? (
        <ol className="mt-3 space-y-1.5">
          {items.map((item, index) => (
            <li key={`${item.provider}-${item.mediaType}-${item.providerMediaId}`}>
              <Link
                href={mediaPath({
                  provider: item.provider,
                  mediaType: item.mediaType,
                  providerMediaId: item.providerMediaId,
                })}
                className="flex min-h-[48px] items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition hover:bg-background/45"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-bold text-[#9fcaff]">
                  {index + 1}
                </span>
                <div className="h-9 w-7 shrink-0 overflow-hidden rounded-md border border-border bg-background">
                  {item.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.posterUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {item.title}
                </span>
                <span className="muted shrink-0 text-xs">
                  {showRating && item.averageRating !== null
                    ? `★ ${item.averageRating.toFixed(1)}`
                    : item.count}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted mt-4 text-sm">{empty}</p>
      )}
    </div>
  );
}

function MemberCard({
  member,
  ownProfile,
}: {
  member: GuildMemberPreview;
  ownProfile: boolean;
}) {
  const name = member.globalName ?? member.username;
  return (
    <Link
      href={ownProfile ? "/profile" : `/profile/${member.id}`}
      className="card flex min-h-[76px] items-center gap-3 px-4 py-3 transition hover:-translate-y-0.5 hover:border-primary/50"
    >
      {member.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-11 w-11 shrink-0 rounded-full border border-border object-cover"
        />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-bold">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold">{name}</p>
          {ownProfile ? (
            <span className="shrink-0 text-[10px] font-bold text-[#8bc8ff]">You</span>
          ) : null}
        </div>
        {member.watching ? (
          <p className="muted mt-0.5 truncate text-xs">
            <span className="text-[#79d9aa]">Watching</span> · {member.watching}
          </p>
        ) : (
          <p className="muted mt-0.5 text-xs">See their taste</p>
        )}
      </div>
    </Link>
  );
}

function ServerIcon({
  iconUrl,
  name,
}: {
  iconUrl: string | null;
  name: string;
}) {
  const classes = "h-16 w-16 rounded-2xl sm:h-[72px] sm:w-[72px]";
  return iconUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconUrl}
      alt={`${name} server icon`}
      loading="lazy"
      decoding="async"
      className={`${classes} shrink-0 border border-border object-cover shadow-lg`}
    />
  ) : (
    <span
      className={`flex ${classes} shrink-0 items-center justify-center border border-border bg-background font-display text-xl font-bold shadow-lg`}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
