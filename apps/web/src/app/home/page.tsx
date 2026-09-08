import Link from "next/link";
import { redirect } from "next/navigation";
import type { MediaSummary } from "@couchlist/shared";
import { Nav } from "@/components/nav";
import { SearchBar } from "@/components/search-bar";
import { Section, EmptyState } from "@/components/section";
import {
  FriendActivity,
  type ActivityItem,
} from "@/components/friend-activity";
import { Poster } from "@/components/poster";
import { currentUser } from "@/lib/auth/session";
import { repos } from "@/lib/db";
import { listFriends } from "@/lib/services/friends";
import { buildGuildPage, type TitleTally } from "@/lib/services/guild";
import { getGlobalTrending } from "@/lib/services/media";

export const dynamic = "force-dynamic";

/**
 * Home stays deliberately familiar: a cozy hero, a tiny first-use guide,
 * useful discovery, friends, then optional Discord communities.
 */
export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect("/");

  const { guilds, entries } = repos();
  const [friends, userGuilds, counts, globalTrending] = await Promise.all([
    listFriends(user),
    guilds.activeGuildsForUser(user.id),
    entries.countsByStatus(user.id),
    getGlobalTrending(20),
  ]);

  const trackedCount =
    counts.WATCHING + counts.COMPLETED + counts.PLAN_TO_WATCH;
  const isNewUser = trackedCount === 0;
  const friendIds = friends.map((friend) => friend.id);
  const [popular, communitySnapshots] = await Promise.all([
    entries.popularAmong(
      friendIds.length > 0 ? [...friendIds, user.id] : [],
      4,
    ),
    Promise.all(userGuilds.map((guild) => buildGuildPage(user.id, guild.id))),
  ]);

  const items: ActivityItem[] = friends
    .filter((friend) => friend.watching !== null)
    .map((friend) => ({
      userId: friend.id,
      username: friend.username,
      globalName: friend.globalName,
      avatarUrl: friend.avatarUrl,
      provider: friend.watching!.provider,
      mediaType: friend.watching!.mediaType,
      providerMediaId: friend.watching!.providerMediaId,
      title: friend.watching!.title,
      progress: friend.watching!.progress,
      updatedAt: friend.watching!.updatedAt,
      sharedServers: friend.sharedServers,
    }))
    .sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )
    .slice(0, 5);

  return (
    <>
      <Nav avatarUrl={user.avatarUrl} username={user.username} />

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <div className="mt-6 sm:hidden">
          <SearchBar />
        </div>

        <section className="cozy-hero mt-6 overflow-hidden rounded-[28px] border border-border">
          <div className="cozy-hero-copy">
            <span className="cozy-kicker">Couchlist</span>
            <h1 className="font-display mt-2 text-3xl font-bold leading-tight sm:text-4xl">
              Good shows.
              <br />
              <span className="text-[#7fc8ff]">Better company.</span>
            </h1>
            <p className="mt-3 max-w-md text-sm font-medium leading-6 text-[#b7c2d3] sm:text-base">
              Keep your list simple, see what your people are into, and find
              something worth staying in for.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/search" className="btn-primary">
                Find something to watch
              </Link>
              <Link href="/watch-together" className="btn-secondary">
                Pick with friends
              </Link>
            </div>
          </div>
          <div className="cozy-couch" aria-hidden="true">
            <div className="cozy-lamp" />
            <div className="cozy-tv">one more episode?</div>
            <div className="cozy-person">
              <span className="cozy-head" />
              <span className="cozy-body" />
              <span className="cozy-leg cozy-leg-one" />
              <span className="cozy-leg cozy-leg-two" />
            </div>
            <div className="cozy-sofa" />
          </div>
        </section>

        {isNewUser ? <NewUserGuide /> : null}

        <TrendingSection
          anime={globalTrending.anime}
          movies={globalTrending.moviesAndTv.filter(
            (item) => item.mediaType === "MOVIE",
          )}
          tv={globalTrending.moviesAndTv.filter(
            (item) => item.mediaType === "TV",
          )}
          degraded={globalTrending.degraded}
        />

        <Section title="Friends Watching">
          {items.length > 0 ? (
            <FriendActivity items={items} />
          ) : (
            <EmptyState>
              Add a Couchlist friend to see what they&apos;re watching. Friends
              work even if you don&apos;t share a Discord server.
            </EmptyState>
          )}
        </Section>

        <Section title="Popular With Friends">
          {popular.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {popular.map((item) => (
                <Poster
                  key={`${item.provider}-${item.mediaType}-${item.providerMediaId}`}
                  provider={item.provider}
                  mediaType={item.mediaType}
                  providerMediaId={item.providerMediaId}
                  title={item.title}
                  posterUrl={item.posterUrl}
                  rating={item.averageRating}
                  caption={`${item.memberCount} person${item.memberCount === 1 ? "" : "s"}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState>
              This fills in automatically as you and your friends add titles.
              For now, try something from Trending above.
            </EmptyState>
          )}
        </Section>

        <Section title="Community Servers">
          {userGuilds.length > 0 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-primary/20 bg-primary/[0.07] px-4 py-3">
                <p className="text-sm font-bold text-[#c5d0ff]">
                  Server perks unlocked ✦
                </p>
                <p className="muted mt-1">
                  These are Discord servers connected to Couchlist. Open one to
                  see what members are watching, rating, and saving for later.
                </p>
              </div>

              {userGuilds.map((guild, index) => {
                const snapshot = communitySnapshots[index];
                const watching = snapshot?.currentlyWatching.slice(0, 3) ?? [];
                const wanted = snapshot?.wantToWatch.slice(0, 3) ?? [];
                return (
                  <Link
                    key={guild.id}
                    href={`/server/${guild.discordId}`}
                    className="community-card block rounded-[24px] border border-border bg-card/95 p-4 transition hover:border-primary/50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <ServerIcon iconUrl={guild.iconUrl} name={guild.name} />
                        <div className="min-w-0">
                          <p className="truncate font-display text-base font-bold">
                            {guild.name}
                          </p>
                          <p className="muted">
                            {snapshot?.memberCount ?? 0} Couchlist member
                            {snapshot?.memberCount === 1 ? "" : "s"} · Discord
                            community
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[10px] font-bold text-[#afbdff]">
                        Open community →
                      </span>
                    </div>

                    {watching.length > 0 || wanted.length > 0 ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <CommunityMiniList
                          label="Watching in this server"
                          items={watching}
                        />
                        <CommunityMiniList
                          label="Want to watch next"
                          items={wanted}
                        />
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-border/80 bg-background/45 px-4 py-3">
                        <p className="text-sm font-bold">
                          Nothing tracked here yet.
                        </p>
                        <p className="muted mt-1">
                          As members add titles, this card will show the
                          server&apos;s shared taste.
                        </p>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="card px-5 py-7">
              <p className="font-display text-lg font-bold">
                Servers are optional.
              </p>
              <p className="muted mt-1 max-w-2xl">
                Couchlist works with just your friends. If a server owner adds
                the Couchlist bot, members unlock a shared community page
                without changing their personal friend list.
              </p>
            </div>
          )}
        </Section>
      </main>
    </>
  );
}

function NewUserGuide() {
  const steps = ["Search a title", "Save it", "Add a friend"] as const;

  return (
    <section className="getting-started mt-5 rounded-[20px] border border-[#314862] px-4 py-3.5 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="cozy-kicker">Start here</span>
            <p className="font-display text-sm font-bold sm:text-base">
              New to Couchlist? Search → save → add a friend.
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {steps.map((step, index) => (
              <span
                key={step}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/90 bg-background/55 px-2.5 py-1 text-xs font-bold text-[#cbd6e6]"
              >
                <span className="text-[#8bc8ff]">{index + 1}</span>
                {step}
              </span>
            ))}
          </div>
        </div>
        <Link href="/search" className="btn-primary shrink-0">
          Search titles →
        </Link>
      </div>
    </section>
  );
}

function TrendingSection({
  anime,
  movies,
  tv,
  degraded,
}: {
  anime: MediaSummary[];
  movies: MediaSummary[];
  tv: MediaSummary[];
  degraded: boolean;
}) {
  const hasAnything = anime.length > 0 || movies.length > 0 || tv.length > 0;

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold">Trending Right Now</h2>
          <p className="muted mt-1">
            A quick global starting point when your Couchlist is still quiet.
          </p>
        </div>
        <Link
          href="/search"
          className="text-sm font-bold text-primary hover:text-primary-hover"
        >
          Search anything →
        </Link>
      </div>

      {!hasAnything ? (
        <EmptyState>
          Trending is unavailable right now, but search still works normally.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {anime.length > 0 ? (
            <TrendingRow title="Anime" items={anime} />
          ) : null}
          {movies.length > 0 ? (
            <TrendingRow title="Movies" items={movies} />
          ) : null}
          {tv.length > 0 ? <TrendingRow title="TV Shows" items={tv} /> : null}
        </div>
      )}
      {degraded ? (
        <p className="muted mt-3 text-xs">
          One discovery source is temporarily unavailable, so this list may be
          shorter than usual.
        </p>
      ) : null}
    </section>
  );
}

function TrendingRow({
  title,
  items,
}: {
  title: string;
  items: MediaSummary[];
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full bg-[#7fc8ff]"
          aria-hidden="true"
        />
        <h3 className="font-display text-sm font-bold text-[#dce8f6]">
          {title}
        </h3>
      </div>
      <div className="poster-shelf -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {items.slice(0, 6).map((item) => (
          <div
            key={`${item.provider}-${item.mediaType}-${item.providerMediaId}`}
            className="w-[132px] shrink-0 snap-start sm:w-[146px]"
          >
            <Poster
              provider={item.provider}
              mediaType={item.mediaType}
              providerMediaId={item.providerMediaId}
              title={item.title}
              posterUrl={item.posterUrl}
              caption={item.year ? String(item.year) : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CommunityMiniList({
  label,
  items,
}: {
  label: string;
  items: TitleTally[];
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-background/45 px-3.5 py-3">
      <p className="text-xs font-bold text-[#c7d2e5]">{label}</p>
      <ol className="mt-2 space-y-2">
        {items.map((item, index) => (
          <li
            key={`${item.provider}-${item.mediaType}-${item.providerMediaId}`}
            className="flex min-w-0 items-center gap-2.5 text-sm"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#172234] text-[10px] font-bold text-[#9fcaff]">
              {index + 1}
            </span>
            <div className="h-8 w-6 shrink-0 overflow-hidden rounded border border-border bg-card">
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
            <span className="min-w-0 flex-1 truncate font-semibold text-[#e8edf5]">
              {item.title}
            </span>
            <span className="muted shrink-0 text-[11px]">{item.count}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ServerIcon({
  iconUrl,
  name,
}: {
  iconUrl: string | null;
  name: string;
}) {
  const classes = "h-11 w-11 rounded-xl";
  return iconUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconUrl}
      alt={`${name} server icon`}
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      className={`${classes} border border-border object-cover`}
    />
  ) : (
    <span
      className={`flex ${classes} items-center justify-center border border-border bg-background font-display font-bold`}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
