import Link from 'next/link';
import { mediaPath } from '@couchlist/shared';

/**
 * Poster tile.
 *
 * Posters carry the colour in the interface, so the frame around them stays
 * deliberately plain.
 */
export function Poster({
  provider,
  mediaType,
  providerMediaId,
  title,
  posterUrl,
  caption,
  rating,
}: {
  provider: 'ANILIST' | 'JIKAN' | 'TMDB';
  mediaType: 'ANIME' | 'MOVIE' | 'TV';
  providerMediaId: string;
  title: string;
  posterUrl: string | null;
  caption?: string;
  rating?: number | null;
}) {
  return (
    <Link
      href={mediaPath({ provider, mediaType, providerMediaId })}
      className="group block w-full transition-transform duration-200 hover:-translate-y-1"
    >
      <div className="aspect-[2/3] w-full overflow-hidden rounded-2xl border border-border bg-card shadow-lg transition-shadow group-hover:border-primary/50 group-hover:shadow-[0_14px_30px_rgba(0,0,0,0.35)]">
        {posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-opacity group-hover:opacity-85"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-text-secondary">
            {title}
          </div>
        )}
      </div>

      <p className="mt-2.5 truncate text-sm font-bold">{title}</p>
      {rating != null ? (
        <p className="muted mt-0.5">★ {rating.toFixed(1)}</p>
      ) : null}
      {caption ? <p className="muted mt-0.5 truncate">{caption}</p> : null}
    </Link>
  );
}
