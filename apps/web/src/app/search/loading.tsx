import { ListSkeleton, LoadingRegion } from '@/components/skeleton';

export default function SearchLoading() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-20">
      <LoadingRegion label="Searching" />
      <div className="mt-6">
        <ListSkeleton rows={5} />
      </div>
    </main>
  );
}
