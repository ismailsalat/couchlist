import Link from "next/link";
import { redirect } from "next/navigation";
import { AppError, mediaPath } from "@couchlist/shared";
import { Nav } from "@/components/nav";
import { currentUser } from "@/lib/auth/session";
import { requireGuildMember } from "@/lib/api/guards";
import {
  buildGuildPage,
  type GuildPageData,
  type TitleTally,
} from "@/lib/services/guild";

export const dynamic = "force-dynamic";

/**
 * Optional community hub unlocked when a server owner connects Couchlist.
 * Personal friends still work independently of this page.
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

  return (
    <>
      <Nav avatarUrl={user.avatarUrl} username={user.username} />

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <div className="mt-8 flex items-center gap-4">
          {page.guild.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.guild.iconUrl}
              alt={`${page.guild.name} server icon`}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              className="h-14 w-14 rounded-2xl border border-border object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card font-display text-lg font-bold">
              {page.guild.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold">
                {page.guild.name}
              </h1>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#b8c6ff]">
                Community hub
              </span>
            </div>
            <p className="muted mt-1">
              {page.memberCount} Couchlist member
              {page.memberCount === 1 ? "" : "s"} · server taste perks unlocked
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/[0.07] px-4 py-4">
          <p className="font-display font-bold text-[#c9d3ff]">
            What this server unlocks ✦
          </p>
          <p className="muted mt-1">
            Members can see what the community is watching, its favorite titles,
            what everyone wants to watch next, and discover other Couchlist
            users from this server.
          </p>
        </div>

        {page.members.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-display mb-4 text-lg font-bold">
              Members on Couchlist
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {page.members.slice(0, 9).map((member) => (
                <Link
                  key={member.id}
                  href={
                    member.id === user.id ? "/profile" : `/profile/${member.id}`
                  }
                  className="card flex items-center gap-3 px-4 py-3 transition hover:-translate-y-0.5 hover:border-primary/50"
                >
                  {member.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={member.avatarUrl}
                      alt=""
                      className="h-10 w-10 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-xs font-bold">
                      {(member.globalName ?? member.username)
                        .slice(0, 1)
                        .toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {member.globalName ?? member.username}
                    </p>
                    <p className="muted truncate">
                      {member.watching
                        ? `Watching ${member.watching}`
                        : "See their taste"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <TallySection
          title="Currently Watching"
          items={page.currentlyWatching}
          unit="watching"
        />
        <TallySection
          title="Highest Rated"
          items={page.highestRated}
          showRating
        />
        <TallySection
          title="Want to Watch"
          items={page.wantToWatch}
          unit="interested"
        />

        <div className="mt-10">
          <Link href="/friends" className="btn-primary">
            Add people from this server as friends
          </Link>
        </div>
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

function TallySection({
  title,
  items,
  unit,
  showRating = false,
}: {
  title: string;
  items: TitleTally[];
  unit?: string;
  showRating?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="font-display mb-4 text-lg font-bold">{title}</h2>
      <ul className="card divide-y divide-border">
        {items.map((item) => (
          <li
            key={`${item.provider}-${item.mediaType}-${item.providerMediaId}`}
          >
            <Link
              href={mediaPath({
                provider: item.provider,
                mediaType: item.mediaType,
                providerMediaId: item.providerMediaId,
              })}
              className="flex items-center gap-4 px-4 py-3 hover:bg-background/40"
            >
              <div className="h-14 w-10 shrink-0 overflow-hidden rounded-lg border border-border bg-background">
                {item.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.posterUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">
                {item.title}
              </span>
              <span className="muted shrink-0">
                {showRating && item.averageRating !== null
                  ? `★ ${item.averageRating.toFixed(1)}`
                  : `${item.count} ${unit ?? "members"}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
