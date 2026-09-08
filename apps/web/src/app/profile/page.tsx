import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { buildProfile } from '@/lib/services/profile';
import { ProfileScreen } from '@/components/profile-screen';
import { Nav } from '@/components/nav';

export const dynamic = 'force-dynamic';

/** Your own profile. */
export default async function MyProfilePage() {
  const user = await currentUser();
  if (!user) redirect('/');

  const profile = await buildProfile(user, true);

  return (
    <>
      <Nav avatarUrl={user.avatarUrl} username={user.username} />
      <ProfileScreen
        profile={profile}
        privacy={{
          profileVisibility: user.profileVisibility,
          showRatings: user.showRatings,
          showProgress: user.showProgress,
        }}
      />
    </>
  );
}
