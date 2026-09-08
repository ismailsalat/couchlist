import { ListSkeleton, LoadingRegion, Skeleton } from '@/components/skeleton';

export default function MediaLoading() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-20">
      <LoadingRegion label="Loading title" />
      <div className="mt-6 flex gap-6">
        <Skeleton className="hidden aspect-[2/3] w-40 shrink-0 sm:block" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10 w-full max-w-md" />
        </div>
      </div>
      <div className="mt-10 grid grid-cols-3 gap-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <div className="mt-10">
        <ListSkeleton rows={3} />
      </div>
    </main>
  );
}
