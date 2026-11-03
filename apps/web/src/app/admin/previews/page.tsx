import { PreviewReview } from '@/components/admin/preview-review';
import { EmptyState } from '@/components/ui/empty-state';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Screenshots waiting for a decision.
 *
 * A bot took these; nobody has seen them. Until somebody presses Use it, no
 * reader will either — which is the whole reason the capture job is allowed
 * to exist at all.
 */
export default async function AdminPreviewsPage() {
  const pending = await repos().icons.pendingPreviews();

  if (pending.length === 0) {
    return (
      <div className="rounded-card border-2 border-line bg-surface">
        <EmptyState
          title="No screenshots waiting."
          hint="Run the capture job and anything it photographs will appear here before it appears to anyone else."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-muted">
        {pending.length} screenshot{pending.length === 1 ? '' : 's'} to look at. Nobody has seen
        these but you &mdash; a listing shows a picture only once you have said it should.
      </p>

      {pending.map((entry) => (
        <PreviewReview
          key={entry.sourceId}
          sourceId={entry.sourceId}
          sourceName={entry.sourceName}
          domain={entry.domain}
          capturedFrom={entry.capturedFrom}
        />
      ))}
    </div>
  );
}
