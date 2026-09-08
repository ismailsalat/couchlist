/** Per-user command rate limiting, same sliding window as the web app. */
const windows = new Map<string, number[]>();

export function allowCommand(userId: string, limitPerMinute: number): boolean {
  const now = Date.now();
  const cutoff = now - 60_000;

  const hits = (windows.get(userId) ?? []).filter((time) => time > cutoff);
  if (hits.length >= limitPerMinute) {
    windows.set(userId, hits);
    return false;
  }

  hits.push(now);
  windows.set(userId, hits);
  return true;
}

export function resetCommandLimits(): void {
  windows.clear();
}
