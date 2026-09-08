import Link from 'next/link';
import { mediaPath } from '@couchlist/shared';
import type { ProfileView } from '@/lib/services/profile';
import { PrivacyControls } from './privacy-controls';
import { FriendActionButton, type FriendshipState } from './friend-action-button';

const SECTIONS = [
  { status: 'WATCHING' as const, label: 'Watching' },
  { status: 'COMPLETED' as const, label: 'Completed' },
  { status: 'PLAN_TO_WATCH' as const, label: 'Plan to Watch' },
];

/** Profile layout, shared between your own profile and someone else's. */
export function ProfileScreen({
  profile,
  privacy,
  compareHref,
  friendAction,
}: {
  profile: ProfileView;
  privacy?: {
    profileVisibility: 'MUTUAL_SERVERS' | 'PRIVATE';
    showRatings: boolean;
    showProgress: boolean;
  };
  compareHref?: string;
  friendAction?: { targetUserId: string; state: FriendshipState };
}) {
  const name = profile.user.globalName ?? profile.user.username;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20">
      <div className="mt-8 flex items-center gap-4">
        {profile.user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.user.avatarUrl}
            alt=""
            className="h-16 w-16 rounded-full border border-border object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card text-xl">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold">{name}</h1>
          {compareHref ? (
            <Link href={compareHref} className="text-sm font-bold text-primary hover:text-primary-hover">
              Compare taste
            </Link>
          ) : null}
        </div>
        {friendAction ? (
          <FriendActionButton
            targetUserId={friendAction.targetUserId}
            state={friendAction.state}
          />
        ) : null}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <Count label="Watching" value={profile.counts.WATCHING} />
        <Count label="Completed" value={profile.counts.COMPLETED} />
        <Count label="Plan to Watch" value={profile.counts.PLAN_TO_WATCH} />
      </div>

      {SECTIONS.map((section) => {
        const entries = profile.entries.filter((entry) => entry.status === section.status);
        if (entries.length === 0) return null;

        return (
          <section key={section.status} className="mt-10">
            <h2 className="mb-4 text-base font-semibold">{section.label}</h2>
            <ul className="card divide-y divide-border">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={mediaPath({
                      provider: entry.provider,
                      mediaType: entry.mediaType,
                      providerMediaId: entry.providerMediaId,
                    })}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-background/40"
                  >
                    <div className="h-14 w-10 shrink-0 overflow-hidden rounded border border-border bg-background">
                      {entry.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.posterUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{entry.title}</p>
                      <p className="muted">
                        {entry.progress != null ? `Ep. ${entry.progress}` : ''}
                        {entry.progress != null && entry.rating != null ? ' · ' : ''}
                        {entry.rating != null ? `${entry.rating.toFixed(1)}/10` : ''}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {profile.entries.length === 0 ? (
        <div className="card mt-10 px-5 py-10 text-center">
          <p className="muted">Nothing tracked yet.</p>
        </div>
      ) : null}

      {privacy ? <PrivacyControls initial={privacy} /> : null}
    </main>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-4 py-4 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="muted mt-1">{label}</p>
    </div>
  );
}
