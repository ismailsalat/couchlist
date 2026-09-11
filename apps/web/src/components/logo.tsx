/** Couchlist wordmark: red bucket, warm yellow popcorn. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true" className="shrink-0 drop-shadow-sm">
        <circle cx="8" cy="8" r="4" fill="#FFD65A" />
        <circle cx="14" cy="6" r="4.5" fill="#FFE27A" />
        <circle cx="20" cy="8" r="4" fill="#FFD65A" />
        <circle cx="11" cy="10" r="4" fill="#FFE89A" />
        <circle cx="17" cy="10" r="4" fill="#FFE89A" />
        <path d="M5.2 11.5h17.6l-2.1 13a2 2 0 0 1-2 1.7H9.3a2 2 0 0 1-2-1.7l-2.1-13Z" fill="#E53935" />
        <path d="M9.2 11.5h3.2l.4 14.7H10L9.2 11.5Zm6.4 0h3.2L18 26.2h-2.8l.4-14.7Z" fill="#FF665F" />
        <path d="M5.2 11.5h17.6" stroke="#FFB7A8" strokeWidth="1.2" />
      </svg>
      <span className="font-display text-[17px] font-bold tracking-tight">Couchlist</span>
    </span>
  );
}
