/**
 * Poster or banner image with a neutral fallback.
 *
 * Missing artwork is common on both providers, so an absent poster renders as
 * a plain tile rather than a broken image icon.
 */
export function PosterImage({
  src,
  alt,
  className = '',
  rounded = 'rounded-lg',
}: {
  src: string | null;
  alt: string;
  className?: string;
  rounded?: string;
}) {
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center border border-border bg-card ${rounded} ${className}`}
        aria-hidden="true"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="opacity-30">
          <rect x="3" y="4" width="18" height="16" rx="2" stroke="#939AA5" strokeWidth="1.5" />
          <path d="m4 16 4.5-4.5L13 16" stroke="#939AA5" strokeWidth="1.5" />
          <circle cx="15.5" cy="9.5" r="1.5" fill="#939AA5" />
        </svg>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`object-cover ${rounded} ${className}`}
    />
  );
}
