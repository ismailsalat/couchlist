import Link from 'next/link';
import { ThumbsUp } from 'lucide-react';
import type { SourceCategory } from '@couchlist/shared';
import { CategoryPill } from './ui/category-pill';

/**
 * Sources that share a category, shown in the narrow sidebar.
 *
 * A compact list rather than the directory row: the full row carries vote and
 * save controls sized for the main list, and squeezing those into a 260px
 * column leaves the name nowhere to go. Feedback belongs on the source's own
 * page, which is one click away.
 */
export function SimilarSources({
  sources,
}: {
  sources: Array<{
    id: string;
    name: string;
    categories: SourceCategory[];
    likes: number;
  }>;
}) {
  if (sources.length === 0) return null;

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="m-0 text-sm font-semibold text-text">Shares a category</h2>

      <ul className="m-0 mt-2.5 list-none space-y-2.5 p-0">
        {sources.map((source) => (
          <li key={source.id}>
            <Link
              href={`/sources/${source.id}`}
              className="block rounded-lg px-2 py-1.5 text-text no-underline hover:bg-hover"
            >
              <span className="flex items-baseline justify-between gap-2">
                {/* min-w-0 lets the name truncate instead of breaking per
                    character when the column is narrow. */}
                <span className="min-w-0 truncate text-[13px] font-semibold">{source.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted">
                  <ThumbsUp aria-hidden="true" className="h-3 w-3" />
                  {source.likes}
                </span>
              </span>
              <span className="mt-1 flex flex-wrap gap-1">
                {source.categories.slice(0, 3).map((category) => (
                  <CategoryPill key={category} category={category} />
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="m-0 mt-3 text-xs text-muted">
        Listed because they cover the same categories. Not a personalised recommendation.
      </p>
    </section>
  );
}
