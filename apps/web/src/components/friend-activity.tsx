import Link from 'next/link';
import { mediaPath } from '@couchlist/shared';

export interface ActivityItem {
  userId: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  provider: 'ANILIST' | 'JIKAN' | 'TMDB';
  mediaType: 'ANIME' | 'MOVIE' | 'TV';
  providerMediaId: string;
  title: string;
  progress: number | null;
  updatedAt: string;
  sharedServers: Array<{ discordId: string; name: string }>;
}

/** "Friends Watching" - who is watching what, most recent first. */
export function FriendActivity({ items }: { items: ActivityItem[] }) {
  return (
    <ul className="card divide-y divide-border">
      {items.map((item) => (
        <li key={`${item.userId}-${item.providerMediaId}`} className="flex items-center gap-3 px-4 py-3">
          <Link href={`/profile/${item.userId}`} className="shrink-0">
            {item.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.avatarUrl}
                alt=""
                className="h-9 w-9 rounded-full border border-border object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-xs">
                {item.username.slice(0, 1).toUpperCase()}
              </span>
            )}
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/profile/${item.userId}`} className="text-sm font-bold hover:underline">
                {item.globalName ?? item.username}
              </Link>
              {item.sharedServers.slice(0, 2).map((sharedServer) => (
                <Link
                  key={sharedServer.discordId}
                  href={`/server/${sharedServer.discordId}`}
                  className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-[#afbdff] hover:border-primary/60 hover:text-white"
                  title={`Shared server: ${sharedServer.name}`}
                >
                  {sharedServer.name}
                </Link>
              ))}
              {item.sharedServers.length > 2 ? (
                <span className="text-[10px] font-bold text-text-secondary">
                  +{item.sharedServers.length - 2}
                </span>
              ) : null}
            </div>
            <p className="muted truncate">
              Watching{' '}
              <Link
                href={mediaPath({
                  provider: item.provider,
                  mediaType: item.mediaType,
                  providerMediaId: item.providerMediaId,
                })}
                className="text-text-primary hover:underline"
              >
                {item.title}
              </Link>
              {item.progress != null ? ` · Ep. ${item.progress}` : ''}
            </p>
          </div>

          <span className="muted shrink-0">{timeAgo(item.updatedAt)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Compact relative time, e.g. "2m ago". */
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}
