import Link from 'next/link';
import { redirect } from 'next/navigation';
import { mediaPath } from '@couchlist/shared';
import { Nav } from '@/components/nav';
import { EmptyState, Section } from '@/components/section';
import { FriendActionButton } from '@/components/friend-action-button';
import { currentUser } from '@/lib/auth/session';
import { findPeople, listFriends, listPendingFriends } from '@/lib/services/friends';

export const dynamic = 'force-dynamic';

/**
 * Friends are direct Couchlist connections, not Discord guild membership.
 * Connected servers appear only as optional context/discovery.
 */
export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect('/');

  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  const [friends, pending, people] = await Promise.all([
    listFriends(user),
    listPendingFriends(user),
    findPeople(user, query),
  ]);

  const incoming = pending.filter((item) => item.direction === 'incoming');
  const outgoing = pending.filter((item) => item.direction === 'outgoing');
  const discoveries = people.filter((person) => person.relationship !== 'accepted');
  const peopleRows = query
    ? discoveries
        .filter((person) => person.relationship !== 'incoming')
        .map((person) => ({ ...person, actionState: person.relationship }))
    : dedupePeople([
        ...discoveries.map((person) => ({ ...person, actionState: person.relationship })),
        ...outgoing.map((person) => ({ ...person, actionState: person.direction })),
      ]);

  return (
    <>
      <Nav avatarUrl={user.avatarUrl} username={user.username} mobileLabel="Friends" />

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <div className="mt-8">
          <p className="catalog-kicker">People</p>
          <h1 className="font-display mt-1 text-2xl font-black sm:text-3xl">Friends</h1>
          <p className="muted mt-1 max-w-2xl">
            Find people, compare taste, and see what your friends are watching. Connected servers simply help you discover people you already know.
          </p>
        </div>

        <form method="get" action="/friends" className="mt-6 flex max-w-xl gap-2">
          <input
            name="q"
            defaultValue={query}
            minLength={2}
            maxLength={80}
            className="input"
            placeholder="Find someone on Couchlist…"
            aria-label="Find Couchlist users"
          />
          <button type="submit" className="btn-primary shrink-0">
            Find
          </button>
        </form>

        {incoming.length > 0 ? (
          <Section title="Friend Requests">
            <ul className="card divide-y divide-border">
              {incoming.map((person) => (
                <PersonRow key={person.id} person={person} actionState="incoming" />
              ))}
            </ul>
          </Section>
        ) : null}

        <Section title="Friends">
          {friends.length > 0 ? (
            <ul className="card divide-y divide-border">
              {friends.map((friend) => (
                <li
                  key={friend.id}
                  className="flex flex-wrap items-center gap-4 px-4 py-4 transition-colors hover:bg-white/[0.025] sm:flex-nowrap"
                >
                  <Avatar person={friend} />

                  <div className="min-w-0 flex-1">
                    <Link href={`/profile/${friend.id}`} className="truncate text-sm font-bold hover:underline">
                      {friend.globalName ?? friend.username}
                    </Link>
                    {friend.globalName ? (
                      <p className="mt-0.5 truncate text-xs text-text-secondary">@{friend.username}</p>
                    ) : null}

                    {friend.sharedServers.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-secondary">
                          Also in
                        </span>
                        {friend.sharedServers.map((server) => (
                          <Link
                            key={server.discordId}
                            href={`/server/${server.discordId}`}
                            className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-[#afbdff] transition hover:border-primary/60 hover:bg-primary/15 hover:text-white"
                          >
                            {server.name}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs font-medium text-primary/80">Couchlist friend</p>
                    )}

                    <p className="muted mt-1.5 truncate">
                      {friend.watching ? (
                        <>
                          Watching{' '}
                          <Link
                            href={mediaPath({
                              provider: friend.watching.provider,
                              mediaType: friend.watching.mediaType,
                              providerMediaId: friend.watching.providerMediaId,
                            })}
                            className="text-text-primary hover:underline"
                          >
                            {friend.watching.title}
                          </Link>
                          {friend.watching.progress != null ? ` · Ep. ${friend.watching.progress}` : ''}
                        </>
                      ) : (
                        'Not watching anything right now'
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Link href={`/profile/${friend.id}`} className="btn-secondary text-xs">
                      Profile
                    </Link>
                    <Link href={`/compare/${friend.id}`} className="btn-secondary text-xs">
                      Compare
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>
              Your friend list is empty. Search for someone above, or connect a Discord server to
              discover Couchlist users you already share a community with.
            </EmptyState>
          )}
        </Section>

        {query || discoveries.length > 0 || outgoing.length > 0 ? (
          <Section title={query ? 'People' : 'People You May Know'}>
            {discoveries.length > 0 || outgoing.length > 0 ? (
              <ul className="card divide-y divide-border">
                {peopleRows.map((person) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    actionState={person.actionState}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState>No Couchlist users matched that search yet.</EmptyState>
            )}
          </Section>
        ) : null}
      </main>
    </>
  );
}

type RowPerson = {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  sharedServers: Array<{ discordId: string; name: string }>;
};

function PersonRow({
  person,
  actionState,
}: {
  person: RowPerson;
  actionState: 'none' | 'incoming' | 'outgoing' | 'accepted';
}) {
  return (
    <li className="flex items-center gap-4 px-4 py-4">
      <Avatar person={person} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{person.globalName ?? person.username}</p>
        {person.globalName ? (
          <p className="mt-0.5 truncate text-xs text-text-secondary">@{person.username}</p>
        ) : null}
        {person.sharedServers.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {person.sharedServers.map((server) => (
              <Link
                key={server.discordId}
                href={`/server/${server.discordId}`}
                className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-[#afbdff]"
              >
                {server.name}
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted mt-1">On Couchlist</p>
        )}
      </div>
      <FriendActionButton targetUserId={person.id} state={actionState} compact />
    </li>
  );
}

function Avatar({ person }: { person: Pick<RowPerson, 'avatarUrl' | 'globalName' | 'username'> }) {
  const name = person.globalName ?? person.username;
  return person.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={person.avatarUrl}
      alt=""
      className="h-11 w-11 shrink-0 rounded-full border-2 border-border object-cover shadow-md"
    />
  ) : (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background text-sm font-bold">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function dedupePeople<T extends RowPerson & { actionState: 'none' | 'incoming' | 'outgoing' | 'accepted' }>(
  people: T[],
): T[] {
  const seen = new Set<string>();
  return people.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
