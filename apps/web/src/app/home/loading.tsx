import { LoadingRegion, ListSkeleton, PosterGridSkeleton } from '@/components/skeleton';

export default function HomeLoading() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-20">
      <LoadingRegion label="Loading your home page" />
      <section className="mt-10">
        <h2 className="mb-4 text-base font-semibold">Friends Watching</h2>
        <ListSkeleton rows={3} />
      </section>
      <section className="mt-10">
        <h2 className="mb-4 text-base font-semibold">Popular With Friends</h2>
        <PosterGridSkeleton />
      </section>
    </main>
  );
}
