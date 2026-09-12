import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppError } from '@couchlist/shared';
import { Nav } from '@/components/nav';
import { ProfileScreen } from '@/components/profile-screen';
import { currentUser } from '@/lib/auth/session';
import { requireProfileAccess } from '@/lib/api/guards';
import { buildProfile } from '@/lib/services/profile';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

type ProfilePageData =
  | {
      ok: true;
      targetId: string;
      profile: Awaited<ReturnType<typeof buildProfile>>;
      friendState: 'none' | 'incoming' | 'outgoing' | 'accepted';
    }
  | { ok: false };

/**
 * Another user's profile.
 *
 * Access requires a Couchlist friendship or a shared connected server, and
 * the target must not be private.
 */
export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const viewer = await currentUser();
  if (!viewer) redirect('/');

  const { userId } = await params;
  if (userId === viewer.id) redirect('/profile');

  const data = await loadProfilePageData(userId);

  if (!data.ok) {
    return (
      <>
        <Nav avatarUrl={viewer.avatarUrl} username={viewer.username} mobileLabel="Profile" />
        <main className="mx-auto max-w-5xl px-5 py-16 text-center">
          <p className="muted">
            Add them as a Couchlist friend, or view them through a shared connected server.
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
      <Nav avatarUrl={viewer.avatarUrl} username={viewer.username} mobileLabel="Profile" />
      <ProfileScreen
        profile={data.profile}
        compareHref={`/compare/${data.targetId}`}
        friendAction={{ targetUserId: data.targetId, state: data.friendState }}
      />
    </>
  );
}

async function loadProfilePageData(userId: string): Promise<ProfilePageData> {
  try {
    const { viewer, target, isSelf } = await requireProfileAccess(userId);
    const [profile, relationship] = await Promise.all([
      buildProfile(target, isSelf),
      repos().friends.relationship(viewer.id, target.id),
    ]);
    const friendState =
      relationship?.status === 'ACCEPTED'
        ? ('accepted' as const)
        : relationship?.status === 'PENDING'
          ? relationship.requestedByUserId === viewer.id
            ? ('outgoing' as const)
            : ('incoming' as const)
          : ('none' as const);
    return { ok: true, targetId: target.id, profile, friendState };
  } catch (error) {
    if (error instanceof AppError && error.code === 'CL_NOT_FOUND') notFound();
    return { ok: false };
  }
}
