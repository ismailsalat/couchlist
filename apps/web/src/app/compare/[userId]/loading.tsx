import { ListSkeleton, LoadingRegion, Skeleton } from '@/components/skeleton';

export default function CompareLoading() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-20">
      <LoadingRegion label="Comparing taste" />
      <Skeleton className="mt-8 h-6 w-56" />
      <Skeleton className="mt-8 h-32 w-full" />
      <div className="mt-10">
        <ListSkeleton rows={3} />
      </div>
    </main>
  );
}
