import { ListSkeleton, LoadingRegion, Skeleton } from '@/components/skeleton';

export default function ServerLoading() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-20">
      <LoadingRegion label="Loading server" />
      <Skeleton className="mt-8 h-6 w-48" />
      <div className="mt-10">
        <ListSkeleton />
      </div>
    </main>
  );
}
