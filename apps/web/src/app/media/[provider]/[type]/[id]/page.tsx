import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  AppError,
  MEDIA_TYPE_LABEL,
  isValidIdentity,
  mediaIdentitySchema,
  supportsEpisodeProgress,
  mediaContentKey,
} from "@couchlist/shared";
import { Nav } from "@/components/nav";
import { EntryControls } from "@/components/entry-controls";
import { WatchSection } from "@/components/watch-section";
import { MediaTabs } from "@/components/media-tabs";
import { STATUS_STYLE } from "@/lib/status";
import { currentUser } from "@/lib/auth/session";
import { repos } from "@/lib/db";
import {
  getMediaDetail,
  resolveCanonicalMediaKey,
} from "@/lib/services/media";
import { getWatchOptions } from "@/lib/services/watch";
import { visibleMemberIds } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/**
 * Title page: personal friend context first, optional connected-server context
 * second. Friends work independently from servers.
 */
export default async function MediaPage({
  params,
}: {
  params: Promise<{ provider: string; type: string; id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");

  const raw = await params;
  const parsed = mediaIdentitySchema.safeParse({
    provider: raw.provider.toUpperCase(),
    mediaType: raw.type.toUpperCase(),
    providerMediaId: raw.id,
  });
  if (!parsed.success || !isValidIdentity(parsed.data)) notFound();

  const identity = parsed.data;

  let detail;
  try {
    detail = await getMediaDetail(
      identity.provider,
      identity.mediaType,
      identity.providerMediaId,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "CL_NOT_FOUND") notFound();
    return (
      <>
        <Nav avatarUrl={user.avatarUrl} username={user.username} />
        <main className="mx-auto max-w-5xl px-5 py-16 text-center">
          <p className="muted">
            We couldn&apos;t load this title right now. Try again shortly.
          </p>
        </main>
      </>
    );
  }

  const canonicalMediaKey = await resolveCanonicalMediaKey(
    identity,
    detail.canonicalMediaKey,
  );

  const { guilds, entries, friends } = repos();
  const [friendIds, userGuilds, own] = await Promise.all([
    friends.acceptedFriendIds(user.id),
    guilds.activeGuildsForUser(user.id),
    entries.findIdentityOrCanonical(user.id, identity, canonicalMediaKey),
  ]);

  const [friendStats, friendRatings, serverStats, watch] = await Promise.all([
    entries.statsForMedia(friendIds, identity, canonicalMediaKey),
    entries.ratingsForMedia(friendIds, identity, canonicalMediaKey),
    Promise.all(
      userGuilds.map(async (guild) => {
        const memberIds = await visibleMemberIds(user.id, guild.id);
        return {
          guild,
          stats: await entries.statsForMedia(memberIds, identity, canonicalMediaKey),
        };
      }),
    ),
    // Watch data degrades on its own: a source outage must not blank the page.
    getWatchOptions(identity, canonicalMediaKey).catch(() => ({
      options: [],
      degraded: true,
      requiresJustWatchAttribution: false,
    })),
  ]);

  return (
    <>
      <Nav avatarUrl={user.avatarUrl} username={user.username} />

      {detail.bannerUrl ? (
        <div className="relative h-48 w-full overflow-hidden border-b border-border sm:h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={detail.bannerUrl}
            alt=""
            className="h-full w-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>
      ) : null}

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <div className="mt-6 flex gap-6">
          <div className="hidden w-40 shrink-0 sm:block">
            <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-border bg-card">
              {detail.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.posterUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-bold">{detail.title}</h1>
            <p className="muted mt-1">
              {MEDIA_TYPE_LABEL[detail.mediaType]}
              {detail.year ? ` · ${detail.year}` : ""}
              {detail.episodeCount ? ` · ${detail.episodeCount} episodes` : ""}
              {detail.seasonCount ? ` · ${detail.seasonCount} seasons` : ""}
              {detail.runtimeMinutes ? ` · ${detail.runtimeMinutes}m` : ""}
            </p>

            <EntryControls
              media={identity}
              initial={
                own
                  ? {
                      status: own.status,
                      rating: own.rating,
                      progress: own.progress,
                    }
                  : null
              }
              supportsProgress={supportsEpisodeProgress(identity.mediaType)}
              episodeCount={detail.episodeCount}
            />

          </div>
        </div>

        <MediaTabs
          overview={
            <div>
              {detail.description ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">
                  {detail.description.slice(0, 900)}
                  {detail.description.length > 900 ? "…" : ""}
                </p>
              ) : (
                <p className="muted">No synopsis available for this title yet.</p>
              )}

              {detail.genres.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {detail.genres.slice(0, 8).map((genre) => (
                    <span
                      key={genre}
                      className="rounded-full border border-border px-3 py-1 text-xs font-bold text-text-secondary"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              ) : null}

              {detail.studio || detail.status ? (
                <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {detail.studio ? <Meta label="Studio" value={detail.studio} /> : null}
                  {detail.status ? <Meta label="Status" value={detail.status} /> : null}
                  {detail.source ? <Meta label="Source" value={detail.source} /> : null}
                </dl>
              ) : null}
            </div>
          }
          watch={
            <div>
              {friendStats.watching > 0 ? (
                <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-status-watching/35 bg-status-watching/10 px-3.5 py-1.5 text-xs font-bold text-status-watching">
                  <span className={`h-2 w-2 rounded-full ${STATUS_STYLE.WATCHING.dot}`} />
                  {friendStats.watching} {friendStats.watching === 1 ? "friend has" : "friends have"} this in Watching
                </p>
              ) : null}

              <WatchSection
                options={watch.options}
                isAnime={identity.mediaType === "ANIME"}
                degraded={watch.degraded}
                requiresJustWatchAttribution={watch.requiresJustWatchAttribution}
                preferredSourceId={null}
                mediaContext={{
                  contentKey: mediaContentKey({ ...identity, canonicalMediaKey }),
                  title: detail.title,
                  mediaType: identity.mediaType,
                }}
              />
            </div>
          }
          friends={
            <div>
            <section className="mt-10">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-bold">
                    With Your Friends
                  </h2>
                  <p className="muted mt-1">
                    Your personal Couchlist circle — no server required.
                  </p>
                </div>
                <Link
                  href="/friends"
                  className="text-xs font-bold text-primary hover:text-primary-hover"
                >
                  Friends →
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <Stat label="Watched it" value={friendStats.completed} />
                <Stat label="Watching" value={friendStats.watching} />
                <Stat label="Want to watch" value={friendStats.planToWatch} />
              </div>

              {friendStats.averageRating !== null ? (
                <p className="mt-4 text-sm">
                  <span className="muted">Friend-circle average</span>{" "}
                  <span className="ml-2 text-lg font-bold">
                    ★ {friendStats.averageRating.toFixed(1)}
                  </span>
                  <span className="muted">
                    {" "}
                    / 10 · {friendStats.ratingCount} ratings
                  </span>
                </p>
              ) : null}
            </section>

            {friendRatings.length > 0 ? (
              <section className="mt-10">
                <h2 className="font-display mb-4 text-lg font-bold">
                  What Friends Rated It
                </h2>
                <ul className="card divide-y divide-border">
                  {friendRatings.slice(0, 8).map((row) => (
                    <li
                      key={row.userId}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <Link
                        href={`/profile/${row.userId}`}
                        className="text-sm font-bold hover:underline"
                      >
                        {row.globalName ?? row.username}
                      </Link>
                      <span className="text-sm font-bold">
                        {row.rating.toFixed(1)} / 10
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {serverStats.length > 0 ? (
              <section className="mt-10">
                <div className="mb-4">
                  <h2 className="font-display text-lg font-bold">
                    Connected Server Taste ✦
                  </h2>
                  <p className="muted mt-1">
                    Extra community context unlocked by server owners.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {serverStats.map(({ guild, stats }) => (
                    <Link
                      key={guild.id}
                      href={`/server/${guild.discordId}`}
                      className="card px-4 py-4 transition hover:border-primary/50"
                    >
                      <div className="flex items-center gap-3">
                        {guild.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={guild.iconUrl}
                            alt={`${guild.name} server icon`}
                            loading="lazy"
                            decoding="async"
                            fetchPriority="low"
                            className="h-11 w-11 shrink-0 rounded-xl border border-border object-cover"
                          />
                        ) : (
                          <span
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background font-display font-bold"
                            aria-hidden="true"
                          >
                            {guild.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate font-display font-bold">
                              {guild.name}
                            </p>
                            {stats.averageRating !== null ? (
                              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-[#bcc8ff]">
                                ★ {stats.averageRating.toFixed(1)}
                              </span>
                            ) : null}
                          </div>
                          <p className="muted mt-0.5 text-xs">
                            How this Discord community feels about this title
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <ServerStat value={stats.watching} label="watching" />
                        <ServerStat value={stats.completed} label="watched" />
                        <ServerStat value={stats.planToWatch} label="want it" />
                      </div>
                      <p className="mt-3 text-xs font-bold text-primary">
                        Open community →
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
            </div>
          }
        />

      </main>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-secondary">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-bold">{value}</dd>
    </div>
  );
}

function ServerStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/80 bg-background/45 px-2 py-2 text-center">
      <p className="font-display text-base font-bold">{value}</p>
      <p className="text-[10px] font-semibold text-text-secondary">{label}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-4 py-4 text-center">
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="muted mt-1">{label}</p>
    </div>
  );
}
