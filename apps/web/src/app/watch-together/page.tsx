import { redirect } from 'next/navigation';
import { Nav } from '@/components/nav';
import { WatchTogetherForm } from '@/components/watch-together-form';
import { EmptyState } from '@/components/section';
import { currentUser } from '@/lib/auth/session';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Pick Couchlist friends, pick a type, get suggestions. No server required. */
export default async function WatchTogetherPage() {
  const user = await currentUser();
  if (!user) redirect('/');

  const friends = await repos().friends.acceptedFriends(user.id);
  const members = friends.map((friend) => ({
    id: friend.id,
    name: friend.globalName ?? friend.username,
    avatarUrl: friend.avatarUrl,
  }));

  return (
    <>
      <Nav avatarUrl={user.avatarUrl} username={user.username} />

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <h1 className="font-display mt-8 text-2xl font-bold">Find Something to Watch</h1>
        <p className="muted mt-1">
          Pick your Couchlist friends. This works even if you don&apos;t share a Discord server.
        </p>

        {members.length > 0 ? (
          <WatchTogetherForm friends={members} />
        ) : (
          <div className="mt-8">
            <EmptyState>Add at least one Couchlist friend first, then come back here.</EmptyState>
          </div>
        )}
      </main>
    </>
  );
}
