import Link from 'next/link';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { guideLinks, guideSteps, type GuideRow as GuideRowType } from '@couchlist/db';
import { guideTopicMeta } from '@couchlist/shared';

/**
 * One compact, expandable guide row.
 *
 * Built on <details>, so expanding works without JavaScript and the keyboard
 * behaviour is the browser's. The title also links to the guide's own page,
 * which is the shareable, indexable version.
 */
export function GuideRowItem({ guide }: { guide: GuideRowType }) {
  const steps = guideSteps(guide);
  const links = guideLinks(guide);
  const topic = guideTopicMeta(guide.topic);

  return (
    <details data-palette={topic.palette} className="border-b border-line last:border-b-0">
      <summary className="flex min-h-[76px] cursor-pointer list-none items-center gap-2.5 rounded-xl p-3.5 hover:bg-hover [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="flex h-[34px] w-[30px] shrink-0 items-center justify-center rounded-[10px] border border-pal-line bg-pal-bg text-pal-text"
        >
          <TopicIcon icon={topic.icon} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <strong className="text-[13px] font-semibold text-text">{guide.title}</strong>
            {/* The topic tag: before this, a row gave no clue which part of
                the site it came from once the rail scrolled out of view. */}
            <span className="rounded-pill border border-pal-line bg-pal-bg px-2 py-[2px] text-[11px] font-semibold leading-tight text-pal-text">
              {topic.title}
            </span>
          </span>
          <small className="mt-[3px] block text-xs leading-normal text-muted">
            {guide.task}
            {guide.deviceLabel ? <span className="text-muted/75"> &middot; {guide.deviceLabel}</span> : null}
          </small>
        </span>

        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
      </summary>

      <div className="px-4 pb-4 pt-0 text-sm leading-relaxed text-text sm:pl-14 sm:pr-4">
        <p className="mb-3 mt-0">{guide.summary}</p>

        {steps.length > 0 ? (
          <ol className="mb-4 ml-0 list-decimal pl-5">
            {steps.map((step, index) => (
              <li key={index} className="my-1.5 pl-0.5">
                {step}
              </li>
            ))}
          </ol>
        ) : null}

        {links.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="cl-touch inline-flex min-h-[34px] items-center gap-1.5 rounded-pill border border-line bg-bg px-2.5 py-1.5 text-xs text-accent no-underline hover:border-[#a44959] hover:bg-accent-soft"
              >
                {link.label}
                <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
              </a>
            ))}
          </div>
        ) : null}

        {guide.browserNotes ? (
          <p className="m-0 mb-2 border-l-2 border-line pl-2.5 text-xs text-muted">
            <span className="text-text">Browser support:</span> {guide.browserNotes}
          </p>
        ) : null}
        {guide.costNote ? (
          <p className="m-0 mb-2 border-l-2 border-line pl-2.5 text-xs text-muted">
            <span className="text-text">Cost:</span> {guide.costNote}
          </p>
        ) : null}
        {guide.note ? (
          <p className="m-0 border-l-2 border-line pl-2.5 text-xs text-muted">{guide.note}</p>
        ) : null}

        <p className="mb-0 mt-3 text-xs text-muted">
          <Link href={`/guides/${guide.slug}`} className="text-accent">
            Open this guide
          </Link>
          {guide.lastReviewedAt ? (
            <> · Links last checked {guide.lastReviewedAt.toISOString().slice(0, 10)}</>
          ) : (
            /* No invented date: unreviewed says so. */
            <> · Not yet reviewed by a moderator</>
          )}
        </p>
      </div>
    </details>
  );
}

/**
 * Topic glyphs.
 *
 * Inline SVG rather than the icon package, because this renders on the server
 * inside a details element and does not need a client component.
 */
function TopicIcon({ icon }: { icon: string }) {
  const paths: Record<string, string> = {
    'shield-check': 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M9 12l2 2 4-4',
    'circle-play': 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M10 8l6 4-6 4z',
    'book-open': 'M12 7v14 M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
    languages: 'm5 8 6 6 M4 14l6-6 2-3 M2 5h12 M7 2h1 M22 22l-5-10-5 10 M14 18h6',
    captions: 'M16 3H8a5 5 0 0 0-5 5v8a5 5 0 0 0 5 5h8a5 5 0 0 0 5-5V8a5 5 0 0 0-5-5z M7 15h4 M15 15h2 M7 11h2 M13 11h4',
    cast: 'M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2 M2 12a9 9 0 0 1 8 8 M2 16a5 5 0 0 1 4 4 M2 20h.01',
    wrench:
      'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z',
    compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z m4.24-13.76-2.12 6.36-6.36 2.12 2.12-6.36z',
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      {(paths[icon] ?? paths.compass)!.split(' M').map((segment, index) => (
        <path key={index} d={index === 0 ? segment : `M${segment}`} />
      ))}
    </svg>
  );
}
