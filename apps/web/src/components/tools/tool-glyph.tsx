import type { ToolPalette } from '@couchlist/shared';

/**
 * Tool glyphs.
 *
 * Drawn solid rather than taken from an outline set, to match the category
 * icons: at pill size, thin uniform outlines all read as the same grey
 * squiggle, and these have to be told apart at a glance.
 */
export function ToolGlyph({ icon, className = 'h-4 w-4' }: { icon: string; className?: string }) {
  const shared = { viewBox: '0 0 24 24', 'aria-hidden': true as const, className, fill: 'currentColor' };

  switch (icon) {
    case 'shield':
      return (
        <svg {...shared}>
          <path d="M12 1.8 20 5v6.6c0 4.7-3.3 8.6-8 10-4.7-1.4-8-5.3-8-10V5z" />
          <path d="m10.6 15.4-3-3 1.5-1.5 1.5 1.5 4.3-4.3 1.5 1.5z" fill="var(--pal-bg, #1c1d22)" />
        </svg>
      );
    case 'link':
      return (
        <svg {...shared}>
          <path d="M9.5 6.2a1.2 1.2 0 0 1 0 2.4H7a3.4 3.4 0 0 0 0 6.8h2.5a1.2 1.2 0 0 1 0 2.4H7A5.8 5.8 0 0 1 7 6.2z" />
          <path d="M14.5 6.2H17a5.8 5.8 0 0 1 0 11.6h-2.5a1.2 1.2 0 0 1 0-2.4H17a3.4 3.4 0 0 0 0-6.8h-2.5a1.2 1.2 0 0 1 0-2.4z" opacity=".55" />
          <path d="m13.8 2.6 1.9.9-1.6 3.3-1.9-.9zM8.3 17.2l1.9.9-1.6 3.3-1.9-.9z" opacity=".8" />
        </svg>
      );
    case 'pulse':
      return (
        <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 13h4L9 6.5 13 18l2.5-5h6" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...shared}>
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.1c1.1 0 2.3 2 2.7 4.9H9.3c.4-2.9 1.6-4.9 2.7-4.9zM7.2 9c-.3 1-.4 2-.4 3s.1 2 .4 3H4.4a8 8 0 0 1 0-6zm2.1 0h5.4c.2 1 .3 2 .3 3s-.1 2-.3 3H9.3c-.2-1-.3-2-.3-3s.1-2 .3-3zm7.5 0h2.8a8 8 0 0 1 0 6h-2.8c.3-1 .4-2 .4-3s-.1-2-.4-3zM12 19.9c-1.1 0-2.3-2-2.7-4.9h5.4c-.4 2.9-1.6 4.9-2.7 4.9z" />
        </svg>
      );
    case 'download':
      return (
        <svg {...shared}>
          <path d="M11 2.6h2.4v8.1l2.5-2.5 1.7 1.7-5.4 5.4-5.4-5.4 1.7-1.7 2.5 2.5z" />
          <path d="M3.4 16.6h2.4v2.6h12.4v-2.6h2.4v3.1c0 1-.8 1.9-1.9 1.9H5.3c-1 0-1.9-.8-1.9-1.9z" />
        </svg>
      );
    case 'captions':
      return (
        <svg {...shared}>
          <rect x="2" y="4.4" width="20" height="15.2" rx="3" />
          <rect x="5.4" y="9" width="7" height="2.2" rx="1.1" fill="var(--pal-bg, #1c1d22)" />
          <rect x="14" y="9" width="4.6" height="2.2" rx="1.1" fill="var(--pal-bg, #1c1d22)" />
          <rect x="5.4" y="13.2" width="4.6" height="2.2" rx="1.1" fill="var(--pal-bg, #1c1d22)" />
          <rect x="11.6" y="13.2" width="7" height="2.2" rx="1.1" fill="var(--pal-bg, #1c1d22)" />
        </svg>
      );
    case 'film':
      return (
        <svg {...shared}>
          <path d="M2.3 9h19.4v8.6c0 1.6-1.2 2.8-2.8 2.8H5.1c-1.6 0-2.8-1.2-2.8-2.8z" />
          <path d="m2.9 3.6 17.9 2.6c.6.1 1 .6.9 1.2l-.2 1.2L2.1 6z" />
          <path d="m10.4 12.3 5 2.8-5 2.8z" fill="var(--pal-bg, #1c1d22)" />
        </svg>
      );
    case 'book':
      return (
        <svg {...shared}>
          <path d="M11.1 5.6v14a.6.6 0 0 1-.87.53C8.6 19.3 6.4 18.7 3.6 18.5a1.5 1.5 0 0 1-1.4-1.5V5.3c0-.85.72-1.52 1.57-1.46 2.5.18 4.6.76 6.3 1.73.3.17.5.49.5.84z" />
          <path d="M12.9 5.6v14a.6.6 0 0 0 .87.53c1.63-.83 3.83-1.43 6.63-1.63a1.5 1.5 0 0 0 1.4-1.5V5.3c0-.85-.72-1.52-1.57-1.46-2.5.18-4.6.76-6.3 1.73-.3.17-.5.49-.5.84z" opacity=".6" />
        </svg>
      );
    case 'cone':
      return (
        <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
          <path d="M10.6 3h2.8l5 16.4H5.6z" />
          <rect x="2.4" y="19" width="19.2" height="2.6" rx="1.3" />
        </svg>
      );
    default:
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

/** A small coloured tag. Always carries a word, never colour alone. */
export function Pill({
  palette,
  children,
  tone,
}: {
  palette?: ToolPalette;
  children: React.ReactNode;
  tone?: 'ready' | 'testing' | 'soon';
}) {
  const toneClass =
    tone === 'ready'
      ? 'bg-[#2b4037] text-[#b9e1c6] border-[#466c54]'
      : tone === 'testing'
        ? 'bg-[#2f3a4a] text-[#c3d6ee] border-[#4d6180]'
        : tone === 'soon'
          ? 'bg-warn-bg text-warn-text border-warn-line'
          : 'bg-pal-bg text-pal-text border-pal-line';

  return (
    <span
      data-palette={tone ? undefined : palette}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2 py-[3px] text-[11.5px] font-semibold leading-tight ${toneClass}`}
    >
      {children}
    </span>
  );
}
