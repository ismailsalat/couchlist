import Link from 'next/link';
import type { SourceCategory } from '@couchlist/shared';
import { AdsWarning, AvoidWarning, CategoryPill } from './ui/category-pill';
import { SourceRowActions } from './source-row-actions';

/**
 * One compact directory row.
 *
 * Layout, left to right: the list position, a small site icon, the name with
 * its category pills and any warning, a one-line description, then a direct
 * link to the website and the feedback and save controls.
 *
 * The row offers two destinations on purpose. The name opens Couchlist's page
 * about the source, for someone deciding whether to trust it; the arrow goes
 * straight to the website, for someone who has already decided and does not
 * want to click twice. Keeping them as separate targets means neither reader
 * is made to take the other one's route.
 */

export interface SourceRowData {
  id: string;
  name: string;
  domain: string;
  homepageUrl: string;
  description: string | null;
  categories: SourceCategory[];
  hasLotsOfAds: boolean;
  shouldAvoid: boolean;
  avoidReason: string | null;
  likes: number;
  dislikes: number;
  /** True when a contributor supplied a site icon. */
  hasIcon: boolean;
}

export function SourceRow({
  source,
  position,
  userVote,
  saved,
  canInteract,
  note,
}: {
  source: SourceRowData;
  /** Current position in the list. Not a score, not a rating. */
  position: number;
  userVote: 'LIKE' | 'DISLIKE' | null;
  saved: boolean;
  canInteract: boolean;
  note?: string | null;
}) {
  // The first category drives the row's accent, matching the reference.
  const primaryCategory = source.categories[0];

  return (
    <article
      data-category={primaryCategory}
      className="cl-row border-b border-line last:border-b-0 even:[&_.cl-tile]:rotate-3"
    >
      {/*
        * Wraps on a narrow screen: the name and description keep the full
        * width of the first line, and the controls drop to a second line of
        * their own. Squeezing three controls in beside the text left room
        * for about four words of description, which is not a description.
        */}
      <div className="flex min-h-row flex-wrap items-center gap-x-2 gap-y-1 rounded-[9px] px-0.5 py-2.5 hover:bg-hover sm:flex-nowrap sm:gap-3 sm:px-[7px]">
        <span className="w-5 min-w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-muted sm:w-7 sm:min-w-7 sm:text-base">
          {position}
        </span>

        <SourceIcon
          name={source.name}
          domain={source.domain}
          sourceId={source.id}
          hasIcon={source.hasIcon}
        />

        <div className="min-w-0 flex-1 basis-40">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 sm:gap-x-[7px]">
            {/* The name is the link to the source page: one obvious target,
                and it keeps working when the row's expand button is hidden on
                a narrow screen. */}
            <Link
              href={`/sources/${source.id}`}
              className="text-[13px] font-bold text-text [overflow-wrap:anywhere] hover:text-accent sm:text-sm"
            >
              {source.name}
            </Link>
            {source.categories.map((category) => (
              <CategoryPill key={category} category={category} />
            ))}
            {source.hasLotsOfAds ? <AdsWarning /> : null}
            {source.shouldAvoid ? <AvoidWarning reason={source.avoidReason} /> : null}
          </div>

          {source.description ? (
            <p className="cl-desc-clamp m-0 mt-0.5 text-sm text-muted">{source.description}</p>
          ) : null}

          {note ? (
            <p className="m-0 mt-1 text-xs text-muted">
              <span className="text-text">Your note:</span> {note}
            </p>
          ) : null}
        </div>

        <div className="flex w-full items-center justify-end gap-1 sm:w-auto sm:gap-1.5">
          <VisitLink name={source.name} domain={source.domain} homepageUrl={source.homepageUrl} />

          <SourceRowActions
            sourceId={source.id}
            sourceName={source.name}
            initialLikes={source.likes}
            initialDislikes={source.dislikes}
            initialVote={userVote}
            initialSaved={saved}
            canInteract={canInteract}
          />
        </div>
      </div>
    </article>
  );
}

/**
 * The small square site icon.
 *
 * A letter tile, tilted alternately, as in the reference. A favicon request
 * per row would leak the reader's visit to every listed site, so the tile is
 * drawn locally instead.
 */
function SourceIcon({
  name,
  domain,
  sourceId,
  hasIcon,
}: {
  name: string;
  domain: string;
  sourceId: string;
  hasIcon: boolean;
}) {
  const initial = (name.trim()[0] ?? domain.trim()[0] ?? '?').toUpperCase();

  /*
   * A contributor's uploaded icon when there is one, otherwise a letter tile.
   * The image is served from Couchlist's own route, never hot-linked from the
   * listed site — which would tell every site in the directory who is reading
   * the list.
   */
  return (
    <span
      aria-hidden="true"
      className="cl-tile grid h-8 w-8 shrink-0 -rotate-3 place-items-center overflow-hidden rounded-[10px] border-2 border-category-line bg-category-bg text-sm font-bold text-category-text shadow-tile sm:h-[34px] sm:w-[34px]"
    >
      {hasIcon ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`/api/sources/${sourceId}/icon`}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        initial
      )}
    </span>
  );
}

/**
 * Straight to the website.
 *
 * `rel="noopener noreferrer nofollow"` on every outbound link: noopener and
 * noreferrer so the destination gets neither a handle on this tab nor the
 * page the reader came from, nofollow because a directory listing is not an
 * endorsement worth passing on.
 */
function VisitLink({
  name,
  domain,
  homepageUrl,
}: {
  name: string;
  domain: string;
  homepageUrl: string;
}) {
  return (
    <a
      href={homepageUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={`Open ${domain} in a new tab`}
      aria-label={`Open ${name} website in a new tab`}
      className="cl-touch cl-pill flex h-11 w-9 shrink-0 items-center justify-center rounded-pill border-2 border-line bg-bg text-muted hover:border-accent hover:bg-accent-soft hover:text-accent sm:h-8 sm:w-8"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <path d="M7 7h10v10" />
        <path d="M7 17 17 7" />
      </svg>
    </a>
  );
}
