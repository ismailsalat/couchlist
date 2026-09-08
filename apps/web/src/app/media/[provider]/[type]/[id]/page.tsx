import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  AppError,
  MEDIA_TYPE_LABEL,
  isValidIdentity,
  mediaIdentitySchema,
  supportsEpisodeProgress,
} from '@couchlist/shared';
import { Nav } from '@/components/nav';
import { EntryControls } from '@/components/entry-controls';
import { currentUser } from '@/lib/auth/session';
import { repos } from '@/lib/db';
import { getMediaDetail } from '@/lib/services/media';
import { visibleMemberIds } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';

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
  if (!user) redirect('/');

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
    detail = await getMediaDetail(identity.provider, identity.mediaType, identity.providerMediaId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'CL_NOT_FOUND') notFound();
    return (
      <>
        <Nav avatarUrl={user.avatarUrl} username={user.username} />
        <main className="mx-auto max-w-5xl px-5 py-16 text-center">
          <p className="muted">We couldn&apos;t load this title right now. Try again shortly.</p>
        </main>
      </>
    );
  }

  const { guilds, entries, friends } = repos();
  const [friendIds, userGuilds, own] = await Promise.all([
    friends.acceptedFriendIds(user.id),
    guilds.activeGuildsForUser(user.id),
    entries.find(user.id, identity),
  ]);

  const [friendStats, friendRatings, serverStats] = await Promise.all([
    entries.statsForMedia(friendIds, identity),
    entries.ratingsForMedia(friendIds, identity),
    Promise.all(
      userGuilds.map(async (guild) => {
        const memberIds = await visibleMemberIds(user.id, guild.id);
        return {
          guild,
          stats: await entries.statsForMedia(memberIds, identity),
        };
      }),
    ),
  ]);

  return (
    <>
      <Nav avatarUrl={user.avatarUrl} username={user.username} />

      {detail.bannerUrl ? (
        <div className="relative h-48 w-full overflow-hidden border-b border-border sm:h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={detail.bannerUrl} alt="" className="h-full w-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>
      ) : null}

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <div className="mt-6 flex gap-6">
          <div className="hidden w-40 shrink-0 sm:block">
            <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-border bg-card">
              {detail.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detail.posterUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-bold">{detail.title}</h1>
            <p className="muted mt-1">
              {MEDIA_TYPE_LABEL[detail.mediaType]}
              {detail.year ? ` · ${detail.year}` : ''}
              {detail.episodeCount ? ` · ${detail.episodeCount} episodes` : ''}
              {detail.seasonCount ? ` · ${detail.seasonCount} seasons` : ''}
              {detail.runtimeMinutes ? ` · ${detail.runtimeMinutes}m` : ''}
            </p>

            <EntryControls
              media={identity}
              initial={own ? { status: own.status, rating: own.rating, progress: own.progress } : null}
              supportsProgress={supportsEpisodeProgress(identity.mediaType)}
              episodeCount={detail.episodeCount}
            />

            {detail.description ? (
              <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
                {detail.description.slice(0, 600)}
                {detail.description.length > 600 ? '…' : ''}
              </p>
            ) : null}

            {detail.genres.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {detail.genres.slice(0, 6).map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full border border-border px-3 py-1 text-xs font-bold text-text-secondary"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <section className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold">With Your Friends</h2>
              <p className="muted mt-1">Your personal Couchlist circle — no server required.</p>
            </div>
            <Link href="/friends" className="text-xs font-bold text-primary hover:text-primary-hover">
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
              <span className="muted">Friend-circle average</span>{' '}
              <span className="ml-2 text-lg font-bold">★ {friendStats.averageRating.toFixed(1)}</span>
              <span className="muted"> / 10 · {friendStats.ratingCount} ratings</span>
            </p>
          ) : null}
        </section>

        {friendRatings.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-display mb-4 text-lg font-bold">What Friends Rated It</h2>
            <ul className="card divide-y divide-border">
              {friendRatings.slice(0, 8).map((row) => (
                <li key={row.userId} className="flex items-center justify-between px-4 py-3">
                  <Link href={`/profile/${row.userId}`} className="text-sm font-bold hover:underline">
                    {row.globalName ?? row.username}
                  </Link>
                  <span className="text-sm font-bold">{row.rating.toFixed(1)} / 10</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {serverStats.length > 0 ? (
          <section className="mt-10">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold">Connected Server Taste ✦</h2>
              <p className="muted mt-1">Extra community context unlocked by server owners.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {serverStats.map(({ guild, stats }) => (
                <Link key={guild.id} href={`/server/${guild.discordId}`} className="card px-4 py-4 transition hover:border-primary/50">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold">{guild.name}</p>
                    {stats.averageRating !== null ? (
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-[#bcc8ff]">
                        ★ {stats.averageRating.toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                  <p className="muted mt-2">
                    {stats.watching} watching · {stats.completed} watched · {stats.planToWatch} want to watch
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </>
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
