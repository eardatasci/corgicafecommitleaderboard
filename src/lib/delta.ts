/**
 * Contributions made during a session. Clamped at zero: force-pushes, deleted
 * commits, or a rolling query window can make GitHub's counter go backwards.
 */
export function sessionCommits(startCount: number, currentCount: number): number {
  return Math.max(0, currentCount - startCount);
}
