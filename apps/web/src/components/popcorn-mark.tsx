/**
 * The Couchlist mark: a small, slightly tilted red-and-cream popcorn box with
 * warm yellow popcorn.
 *
 * Drawn with CSS (see globals.css) rather than an image, so it scales with
 * text, costs no request, and stays crisp on any display.
 */
export function PopcornMark({ className }: { className?: string }) {
  return (
    <span
      className={`cl-popcorn-box ${className ?? ''}`.trim()}
      role="img"
      aria-label="Couchlist popcorn box"
    >
      <span className="cl-kernels">
        <b />
        <b />
        <b />
        <b />
        <b />
      </span>
      <span className="cl-bucket" />
    </span>
  );
}

/** The mark plus the wordmark. Used in the header and on auth pages. */
export function Brand({ tagline = 'good finds' }: { tagline?: string | null }) {
  return (
    <span className="flex items-center gap-2.5 whitespace-nowrap text-xl font-bold tracking-tight">
      <PopcornMark />
      Couchlist
      {tagline ? (
        <span className="ml-0.5 hidden rounded-pill border border-line bg-bg px-2 py-[3px] text-xs font-normal tracking-normal text-muted sm:inline">
          {tagline}
        </span>
      ) : null}
    </span>
  );
}
