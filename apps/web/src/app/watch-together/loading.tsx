import { LoadingRegion, Skeleton } from '@/components/skeleton';

export default function WatchTogetherLoading() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-20">
      <LoadingRegion label="Loading Watch Together" />
      <Skeleton className="mt-8 h-6 w-64" />
      <Skeleton className="mt-6 h-9 w-full max-w-sm" />
      <Skeleton className="mt-6 h-9 w-full max-w-xs" />
    </main>
  );
}
