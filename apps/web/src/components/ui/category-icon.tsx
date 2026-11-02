import type { SourceCategory } from '@couchlist/shared';

/**
 * Category glyphs.
 *
 * Drawn here rather than taken from an icon set, because the set's thin,
 * uniform outlines made the six categories look like one another at pill size.
 * These are solid shapes with a little character — a clapperboard with a
 * proper hinge, a scroll that curls, a comic page with a torn corner — so a
 * category is recognisable before the label is read.
 *
 * Each inherits `currentColor`, so a pill colours its own icon and one
 * component serves every category.
 */
export function CategoryIcon({
  category,
  className = 'h-4 w-4',
}: {
  category: SourceCategory | 'All';
  className?: string;
}) {
  const shared = {
    viewBox: '0 0 24 24',
    'aria-hidden': true as const,
    className,
    fill: 'currentColor',
  };

  switch (category) {
    case 'Anime':
      // A star with a wink of sparkle: the shorthand for "a season to binge".
      return (
        <svg {...shared}>
          <path d="M12 2.6c.4 0 .75.24.9.6l1.86 4.4 4.76.42c.4.03.73.3.85.68a.9.9 0 0 1-.28.98l-3.6 3.1 1.07 4.65a.9.9 0 0 1-.35.95.94.94 0 0 1-1.03.04L12 16.9l-4.1 2.52a.94.94 0 0 1-1.03-.04.9.9 0 0 1-.35-.95l1.08-4.65-3.6-3.1a.9.9 0 0 1-.29-.98c.12-.38.45-.65.85-.68l4.76-.42 1.86-4.4a.97.97 0 0 1 .9-.6z" />
          <circle cx="19.6" cy="4.4" r="1.5" opacity=".75" />
          <circle cx="4.6" cy="6.4" r="1" opacity=".6" />
        </svg>
      );

    case 'Movies':
      // Clapperboard, hinged open.
      return (
        <svg {...shared}>
          <path d="M2.6 9.3h18.8c.66 0 1.1.45 1.1 1.1v7.9c0 1.2-.9 2.1-2.1 2.1H3.6c-1.2 0-2.1-.9-2.1-2.1v-7.9c0-.65.45-1.1 1.1-1.1z" />
          <path
            d="M3.1 3.9 20.3 6.4c.6.1 1 .64.9 1.23l-.2 1.17-19-2.7.2-1.2c.1-.6.6-1 1.2-.9z"
            opacity=".9"
          />
          <path d="m7.1 4.6 1.6 2.4-2.5-.35-1.6-2.4zM12.3 5.35l1.6 2.4-2.5-.35-1.6-2.4zM17.5 6.1l1.6 2.4-2.5-.35-1.6-2.4z" fill="var(--cl-surface)" />
        </svg>
      );

    case 'TV':
      // A set with rabbit-ear antennae and a little stand.
      return (
        <svg {...shared}>
          <path d="m7.8 2.2 4.2 3.1 4.2-3.1.95 1.3-3.1 2.3h3.35c1.5 0 2.7 1.2 2.7 2.7v7.9c0 1.5-1.2 2.7-2.7 2.7H6.6c-1.5 0-2.7-1.2-2.7-2.7V8.5c0-1.5 1.2-2.7 2.7-2.7h3.35l-3.1-2.3z" />
          <rect x="6.6" y="8.5" width="8.4" height="7.9" rx="1.1" fill="var(--cl-surface)" opacity=".55" />
          <circle cx="17.6" cy="11" r="1.05" fill="var(--cl-surface)" />
          <circle cx="17.6" cy="14.2" r="1.05" fill="var(--cl-surface)" opacity=".7" />
          <path d="M8.4 20.4h7.2c.5 0 .9.4.9.9s-.4.9-.9.9H8.4c-.5 0-.9-.4-.9-.9s.4-.9.9-.9z" opacity=".8" />
        </svg>
      );

    case 'Manga':
      // An open book, spine down the middle.
      return (
        <svg {...shared}>
          <path d="M11.1 5.6v14a.6.6 0 0 1-.87.53C8.6 19.3 6.4 18.7 3.6 18.5a1.5 1.5 0 0 1-1.4-1.5V5.3c0-.85.72-1.52 1.57-1.46 2.5.18 4.6.76 6.3 1.73.3.17.5.49.5.84z" />
          <path
            d="M12.9 5.6v14c0 .46.47.75.87.53 1.63-.83 3.83-1.43 6.63-1.63a1.5 1.5 0 0 0 1.4-1.5V5.3c0-.85-.72-1.52-1.57-1.46-2.5.18-4.6.76-6.3 1.73-.3.17-.5.49-.5.84z"
            opacity=".72"
          />
        </svg>
      );

    case 'Manhwa':
      // A vertical scroll, curled at the foot: the long-strip format.
      return (
        <svg {...shared}>
          <path d="M6.6 1.9h10.3c1.2 0 2.2 1 2.2 2.2v13.3c0 .5-.4.9-.9.9H8.3c-.5 0-.9-.4-.9-.9V4.1c0-.6-.3-1-.8-1z" />
          <path
            d="M5.8 1.9c1.2 0 2.2 1 2.2 2.2v13.4H4.3c-1.2 0-2.2 1-2.2 2.2 0 1.4 1.1 2.4 2.5 2.4h13.1c1.9 0 3.4-1.5 3.4-3.4v-.7H8.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity=".65"
          />
          <path d="M10.4 6.1h4.9v1.6h-4.9zM10.4 9.5h4.9v1.6h-4.9z" fill="var(--cl-surface)" opacity=".85" />
        </svg>
      );

    case 'Comics':
      // A panel grid with a speech bubble over it.
      return (
        <svg {...shared}>
          <path d="M4.2 2.8h15.6c1.2 0 2.2 1 2.2 2.2v14c0 1.2-1 2.2-2.2 2.2H4.2c-1.2 0-2.2-1-2.2-2.2V5c0-1.2 1-2.2 2.2-2.2z" />
          <path d="M4.7 5.4h6v4.4h-6zM13.3 5.4h6v4.4h-6zM4.7 11.9h14.6v6.7H4.7z" fill="var(--cl-surface)" opacity=".5" />
          <path
            d="M8.1 12.6h7.8c.9 0 1.6.7 1.6 1.6v2.3c0 .9-.7 1.6-1.6 1.6h-3.2l-2.5 1.9.35-1.9H8.1c-.9 0-1.6-.7-1.6-1.6v-2.3c0-.9.7-1.6 1.6-1.6z"
          />
        </svg>
      );

    default:
      // "All": the popcorn kernel, tying the filter row to the mark.
      return (
        <svg {...shared}>
          <path d="M12 2.4c1.5 0 2.8.9 3.4 2.2a3.3 3.3 0 0 1 4.2 3.2c0 .5-.1 1-.3 1.4.9.6 1.5 1.6 1.5 2.8 0 1.2-.6 2.2-1.6 2.8l-1.3 6.3a1.3 1.3 0 0 1-1.27 1.04H7.37A1.3 1.3 0 0 1 6.1 21.1L4.8 14.8A3.35 3.35 0 0 1 3.2 12c0-1.2.6-2.2 1.5-2.8a3.4 3.4 0 0 1-.3-1.4 3.3 3.3 0 0 1 4.2-3.2A3.75 3.75 0 0 1 12 2.4z" />
        </svg>
      );
  }
}
