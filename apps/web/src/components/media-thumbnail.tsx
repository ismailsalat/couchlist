export function MediaThumbnail({
  posterUrl,
  mediaType,
  title,
  size = 'sm',
}: {
  posterUrl: string | null;
  mediaType: 'ANIME' | 'MOVIE' | 'TV';
  title: string;
  size?: 'sm' | 'md';
}) {
  const dimensions = size === 'md' ? 'h-20 w-14 rounded-xl' : 'h-14 w-10 rounded-lg';
  if (posterUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={posterUrl}
        alt={`${title} poster`}
        loading="lazy"
        className={`${dimensions} shrink-0 border border-border/90 object-cover bg-background`}
      />
    );
  }

  const tone = mediaType === 'ANIME' ? 'media-thumb-anime' : mediaType === 'MOVIE' ? 'media-thumb-movie' : 'media-thumb-tv';
  const label = mediaType === 'ANIME' ? 'A' : mediaType === 'MOVIE' ? 'M' : 'TV';
  return (
    <span
      className={`${dimensions} ${tone} flex shrink-0 items-center justify-center border font-display text-xs font-black`}
      aria-label={`${mediaType.toLowerCase()} artwork unavailable`}
      title="Artwork unavailable"
    >
      {label}
    </span>
  );
}

export function MediaTypeMark({ mediaType }: { mediaType: 'ANIME' | 'MOVIE' | 'TV' }) {
  const tone = mediaType === 'ANIME' ? 'media-thumb-anime' : mediaType === 'MOVIE' ? 'media-thumb-movie' : 'media-thumb-tv';
  return (
    <span className={`${tone} flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border font-display text-[10px] font-black`}>
      {mediaType === 'ANIME' ? 'A' : mediaType === 'MOVIE' ? 'M' : 'TV'}
    </span>
  );
}
