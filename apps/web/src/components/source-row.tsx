import Link from 'next/link';
import type { SourceCategory } from '@couchlist/shared';
import {
  AdsWarning,
  AvoidWarning,
  CategoryPill,
  QualityBadge,
  TrustedMark,
} from './ui/category-pill';
import { SourceRowActions } from './source-row-actions';
import { VisitLink } from './visit-link';

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
  trustedRank: number | null;
  trustedNote: string | null;
  qualityLabel: string | null;
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
        * A grid, not a flex row.
        *
        * On a phone the controls and the text cannot both have the width they
        * want. Flex settled that by squeezing the description to three words
        * a line; this lets the description drop underneath and use the whole
        * row instead, while the name, the pills and the controls stay on the
        * line above. From the small breakpoint up there is room for all of it
        * side by side, so the description moves back beside the name.
        *
        * Everything keeps a 44px touch target even where it looks smaller.
        */}
      <div className="grid min-h-row grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-[9px] px-0.5 py-2 hover:bg-hover sm:gap-x-3 sm:px-[7px] sm:py-2.5">
        <span className="w-5 min-w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-muted sm:w-7 sm:min-w-7 sm:text-base">
          {position}
        </span>

        <SourceIcon
          name={source.name}
          domain={source.domain}
          sourceId={source.id}
          hasIcon={source.hasIcon}
        />

        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 sm:gap-x-[7px]">
          {/*
            * The star leads, before the name.
            *
            * A moderator's pick is the one thing here that is a judgement
            * rather than a fact, and putting it first lets a reader scan a
            * column of stars down the left of the names without reading
            * anything else.
            */}
          {source.trustedRank !== null ? <TrustedMark note={source.trustedNote} /> : null}

          {/* The name is the link to the source page: one obvious target,
              and it keeps working when the row's expand button is hidden on
              a narrow screen. */}
          <Link
            href={`/sources/${source.id}`}
            className="text-[13px] font-bold text-text [overflow-wrap:anywhere] hover:text-accent sm:text-sm"
          >
            {source.name}
          </Link>
          {source.qualityLabel ? <QualityBadge label={source.qualityLabel} /> : null}
          {source.categories.map((category) => (
            <CategoryPill key={category} category={category} />
          ))}
          {source.hasLotsOfAds ? <AdsWarning /> : null}
          {source.shouldAvoid ? <AvoidWarning reason={source.avoidReason} /> : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          <VisitLink id={source.id} name={source.name} domain={source.domain} homepageUrl={source.homepageUrl} />

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

        {/*
          * The description spans the controls on a phone and sits under the
          * name alone from the small breakpoint up, which is why it is a grid
          * child rather than a sibling of the name.
          */}
        {source.description ? (
          <p className="cl-desc-clamp col-start-3 col-end-5 m-0 text-sm text-muted sm:col-end-4">
            {source.description}
          </p>
        ) : null}

        {note ? (
          <p className="col-start-3 col-end-5 m-0 text-xs text-muted sm:col-end-4">
            <span className="text-text">Your note:</span> {note}
          </p>
        ) : null}
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

