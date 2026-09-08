/**
 * Couchlist wordmark.
 *
 * The popcorn bucket is inline SVG rather than an image file so it stays crisp
 * and needs no network request.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M5.2 8.5h13.6l-1.5 11.2a1.6 1.6 0 0 1-1.6 1.4H8.3a1.6 1.6 0 0 1-1.6-1.4L5.2 8.5Z"
          fill="#E7E9EE"
        />
        <path d="M9.6 8.5 10.4 21H8.3a1.6 1.6 0 0 1-1.6-1.4L5.2 8.5h4.4Z" fill="#C3C8D2" />
        <path d="M14.4 8.5h4.4l-1.5 11.2a1.6 1.6 0 0 1-1.6 1.4h-2.1l.8-12.6Z" fill="#C3C8D2" />
        <circle cx="9" cy="5.6" r="2.6" fill="#F4F4F5" />
        <circle cx="15" cy="5.6" r="2.6" fill="#F4F4F5" />
        <circle cx="12" cy="4.2" r="2.6" fill="#E7E9EE" />
      </svg>
      <span className="font-display text-[17px] font-bold tracking-tight">Couchlist</span>
    </span>
  );
}
