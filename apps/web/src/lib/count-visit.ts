/**
 * Tells the server a listed website was opened.
 *
 * Fire and forget, with `keepalive` so it survives the page being left for
 * the site in question. Once per listing per browser session: the number is
 * for ranking, not accounting, and counting the same person's third visit
 * this afternoon would make it worse rather than better.
 *
 * Never awaited and never allowed to throw. Somebody pressing Visit is
 * leaving; nothing about that should wait on us.
 */
export function countVisit(sourceId: string): void {
  try {
    const key = `cl.visited.${sourceId}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Private browsing, or storage turned off. Count it anyway.
  }

  try {
    void fetch(`/api/sources/${sourceId}/visit`, { method: 'POST', keepalive: true });
  } catch {
    // Nothing depends on this.
  }
}
