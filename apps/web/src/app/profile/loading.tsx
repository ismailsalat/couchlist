import { ListSkeleton, LoadingRegion, Skeleton } from '@/components/skeleton';

export default function ProfileLoading() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-20">
      <LoadingRegion label="Loading profile" />
      <div className="mt-8 flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <div className="mt-10">
        <ListSkeleton />
      </div>
    </main>
  );
}
