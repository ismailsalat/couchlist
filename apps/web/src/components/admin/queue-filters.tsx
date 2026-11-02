import Link from 'next/link';

/**
 * Search and ordering for the review queue.
 *
 * A plain GET form with no JavaScript: the result is a URL a moderator can
 * bookmark, send to the person they share the work with, or reload after
 * approving something without losing their place.
 *
 * The default order puts the websites the most people asked for first, which
 * is usually the best use of the next ten minutes.
 */

const SORTS = [
  { value: 'suggested', label: 'Most suggested' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
] as const;

export function QueueFilters({
  query,
  sort,
  shown,
  total,
}: {
  query: string;
  sort: string;
  shown: number;
  total: number;
}) {
  const filtering = query.trim().length > 0;

  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-2.5 rounded-card border-2 border-line bg-surface p-3.5"
    >
      <label className="min-w-0 flex-1 text-sm">
        <span className="mb-1 block font-semibold text-text">Search the queue</span>
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Website, name or submitter"
          className="w-full rounded-field border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus-visible:border-focus"
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-semibold text-text">Order</span>
        <select
          name="sort"
          defaultValue={sort}
          className="rounded-field border border-line bg-bg px-3 py-2 text-sm text-text focus-visible:border-focus"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="cl-touch rounded-pill bg-selected px-4 py-2 text-sm font-semibold text-selected-fg hover:bg-selected-hover"
      >
        Apply
      </button>

      {filtering ? (
        <Link
          href="/admin/suggestions"
          className="cl-touch rounded-pill border border-line bg-bg px-3.5 py-2 text-sm text-muted no-underline hover:bg-hover hover:text-text"
        >
          Clear
        </Link>
      ) : null}

      <p className="m-0 w-full text-sm text-muted sm:w-auto">
        {filtering ? `${shown} of ${total} waiting` : `${total} waiting`}
      </p>
    </form>
  );
}
