import Link from 'next/link';

/**
 * The "not here yet" screen, and the "something broke" screen.
 *
 * One component, two messages. Both are the same situation from the reader's
 * side — they wanted a page and there isn't one — so they get the same
 * roadworks furniture rather than two unrelated designs, and the wording
 * carries the difference.
 */
export function ComingSoon({
  heading,
  blurb,
  backHref = '/guides',
  backLabel = 'Back to tools',
}: {
  heading: string;
  blurb: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="grid min-h-[58vh] place-items-center px-4 py-10 text-center">
      <div>
        <div className="cl-hazard mx-auto mb-8 h-[11px] w-[min(430px,80vw)] rounded-pill" aria-hidden />

        <svg
          className="cl-cone mx-auto mb-5 block"
          width="112"
          height="112"
          viewBox="0 0 64 64"
          role="img"
          aria-label="Roadworks cone"
        >
          <ellipse cx="32" cy="55.5" rx="24" ry="5.5" fill="#2a2b32" />
          <path d="M29.9 9.5h4.2l13 42H17z" fill="#f0963f" />
          <path d="M30.6 9.5h2.4l12.4 42h-3.2z" fill="#ffb067" opacity=".55" />
          <path d="M23.6 29h16.8l1.7 5.6H21.9zM20.3 40h23.4l1.8 5.8H18.5z" fill="#fff4df" />
          <rect x="11" y="50" width="42" height="7" rx="3.5" fill="#f0963f" />
          <rect x="11" y="50" width="42" height="2.6" rx="1.3" fill="#ffb067" opacity=".6" />
        </svg>

        <h1 className="m-0 text-[clamp(34px,8vw,62px)] font-extrabold leading-none tracking-[-0.045em]">
          {heading}
        </h1>
        <p className="mx-auto mt-4 max-w-[46ch] text-[15px] text-muted">{blurb}</p>

        <Link
          href={backHref}
          className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-pill bg-selected px-5 text-sm font-bold text-selected-fg hover:bg-selected-hover"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
