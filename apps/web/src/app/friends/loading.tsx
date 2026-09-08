import { ListSkeleton, LoadingRegion } from '@/components/skeleton';

export default function FriendsLoading() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-20">
      <LoadingRegion label="Loading friends" />
      <div className="mt-10">
        <ListSkeleton rows={4} />
      </div>
    </main>
  );
}
