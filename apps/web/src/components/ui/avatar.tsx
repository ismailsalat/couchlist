/**
 * A person's picture, or their initial.
 *
 * Every avatar in the app goes through here, so there is one answer to "what
 * does someone without a picture look like" and one place that decides it.
 * The image is always served from Couchlist's own route — a profile picture
 * is uploaded by a stranger, and hot-linking or trusting a remote URL would
 * hand that stranger a request from every reader who sees their name.
 *
 * An anonymous contributor gets the neutral mark and no name, because the
 * avatar must not become the thing that identifies someone who asked not to
 * be identified.
 */

/*
 * Sizes.
 *
 * All of these were a step smaller, which made a picture somebody chose
 * read as a decoration beside their name rather than as them. Having an
 * account should feel like something, and the avatar is most of that feeling,
 * so each step up is deliberate rather than incidental.
 */
const SIZES = {
  sm: 'h-6 w-6 text-[11px]',
  md: 'h-9 w-9 text-sm',
  lg: 'h-14 w-14 text-lg',
  /** The profile page. Big enough to actually look like a person's picture. */
  xl: 'h-32 w-32 text-4xl',
} as const;

export function Avatar({
  userId,
  displayName,
  hasAvatar,
  size = 'md',
  className = '',
}: {
  userId: string | null;
  displayName: string | null;
  hasAvatar: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initial = (displayName?.trim()[0] ?? '?').toUpperCase();
  const shell = `inline-grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-category-line bg-category-bg font-bold text-category-text ${SIZES[size]} ${className}`;

  if (hasAvatar && userId) {
    return (
      <span className={shell}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/users/${userId}/avatar`}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={shell}>
      {initial}
    </span>
  );
}
