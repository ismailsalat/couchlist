/**
 * Loading placeholders.
 *
 * Sized to match the real content so nothing jumps when data arrives.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border/60 ${className}`} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-border" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-14 w-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PosterGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="aspect-[2/3] w-full" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function SectionSkeleton({ title }: { title: string }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      <ListSkeleton />
    </section>
  );
}

/** Announces loading to assistive technology without a visual spinner. */
export function LoadingRegion({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}
