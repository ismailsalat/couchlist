import { RestoreButton } from '@/components/admin/restore-button';
import { EmptyState } from '@/components/ui/empty-state';
import { nowForRender } from '@/lib/clock';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** How long a deleted listing can still be brought back. */
const RESTORE_DAYS = 30;

/**
 * Recently deleted.
 *
 * Deleting a listing throws away votes, saves, credit and a description
 * somebody wrote, none of which can be typed back in. Thirty days of second
 * thoughts is cheap; the alternative is a moderator who is frightened of the
 * delete button, which is its own kind of mess.
 */
export default async function AdminDeletedPage() {
  const deleted = await repos().sources.recentlyDeleted();
  const now = nowForRender();

  if (deleted.length === 0) {
    return (
      <div className="rounded-card border-2 border-line bg-surface">
        <EmptyState
          title="Nothing has been deleted."
          hint={`Deleted listings wait here for ${RESTORE_DAYS} days before they are removed for good.`}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <p className="m-0 text-sm text-muted">
        Deleted listings wait {RESTORE_DAYS} days before they are removed for good. Restoring one
        brings its votes, saves and credit back with it, hidden, for you to look at before
        publishing.
      </p>

      {deleted.map((entry) => {
        const daysGone = Math.floor((now.getTime() - entry.deletedAt.getTime()) / 86_400_000);
        const daysLeft = Math.max(0, RESTORE_DAYS - daysGone);

        return (
          <article
            key={entry.id}
            className="rounded-card border-2 border-line bg-surface p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-base font-bold text-text">{entry.name}</p>
                <p className="m-0 mt-0.5 break-all text-sm text-muted">{entry.domain}</p>
                <p className="m-0 mt-1.5 text-sm text-muted">
                  {entry.likes} up / {entry.dislikes} down
                  {entry.deletedReason ? ` · ${entry.deletedReason}` : ''}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <RestoreButton id={entry.id} name={entry.name} />
                <span
                  className={`text-xs ${daysLeft <= 3 ? 'font-semibold text-danger-text' : 'text-muted'}`}
                >
                  {daysLeft === 0
                    ? 'Gone for good at the next clean-up'
                    : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
