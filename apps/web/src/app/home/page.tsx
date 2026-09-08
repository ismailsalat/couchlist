import { redirect } from 'next/navigation';
import { Nav } from '@/components/nav';
import { SearchBar } from '@/components/search-bar';
import { Section, EmptyState } from '@/components/section';
import { FriendActivity, type ActivityItem } from '@/components/friend-activity';
import { Poster } from '@/components/poster';
import { currentUser } from '@/lib/auth/session';
import { repos } from '@/lib/db';
import { listFriends } from '@/lib/services/friends';

export const dynamic = 'force-dynamic';

/**
 * Home is personal first. Direct Couchlist friends work with no server at all;
 * connected servers appear separately as optional community perks.
 */
export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect('/');

  const { guilds, entries } = repos();
  const [friends, userGuilds] = await Promise.all([
    listFriends(user),
    guilds.activeGuildsForUser(user.id),
  ]);

  const friendIds = friends.map((friend) => friend.id);
  const popular = await entries.popularAmong(friendIds.length > 0 ? [...friendIds, user.id] : [], 4);

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
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 5);

  return (
    <>
      <Nav avatarUrl={user.avatarUrl} username={user.username} />

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <div className="mt-6 sm:hidden">
          <SearchBar />
        </div>

        <Section title="Friends Watching">
          {items.length > 0 ? (
            <FriendActivity items={items} />
          ) : (
            <EmptyState>
              Add a Couchlist friend to see what they&apos;re watching. You don&apos;t need a Discord
              server to use the friend features.
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
                  caption={`${item.memberCount} person${item.memberCount === 1 ? '' : 's'}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState>
              Your circle hasn&apos;t tracked enough yet. Add a few titles and this fills itself in.
            </EmptyState>
          )}
        </Section>

        <Section title="Community Servers">
          {userGuilds.length > 0 ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-primary/20 bg-primary/[0.07] px-4 py-3">
                <p className="text-sm font-bold text-[#c5d0ff]">Server perks unlocked ✦</p>
                <p className="muted mt-1">
                  Connected servers get a community taste page: what members are watching, highest
                  rated titles, and what everyone wants to watch next.
                </p>
              </div>
              <ul className="card divide-y divide-border">
                {userGuilds.map((guild) => (
                  <li key={guild.id}>
                    <a
                      href={`/server/${guild.discordId}`}
                      className="flex items-center justify-between px-4 py-3 text-sm hover:bg-background/40"
                    >
                      <span className="font-bold">{guild.name}</span>
                      <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-[#afbdff]">
                        View server taste
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="card px-5 py-7">
              <p className="font-display text-lg font-bold">Servers are optional.</p>
              <p className="muted mt-1 max-w-2xl">
                Couchlist works with just your friends. If a server owner adds the Couchlist bot,
                members unlock a shared community page without changing their personal friend list.
              </p>
            </div>
          )}
        </Section>
      </main>
    </>
  );
}
