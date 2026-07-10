export interface RateBudget {
  remaining: number;
  resetAtMs: number;
}

// Worst (lowest-remaining) rate budget observed since the last poll round.
// GitHub reports rateLimit on every GraphQL response; github.ts notes it here.
let worst: RateBudget | null = null;

export function noteRateBudget(budget: RateBudget): void {
  if (!worst || budget.remaining < worst.remaining) worst = budget;
}

export function takeWorstRateBudget(): RateBudget | null {
  const w = worst;
  worst = null;
  return w;
}

/**
 * Adaptive poll delay: run at the configured floor while budget is healthy;
 * when a token runs low (shared with other apps), spread what's left across
 * the time until GitHub's reset instead of draining it.
 */
export function nextPollDelayMs(
  floorSec: number,
  budget: RateBudget | null,
  now: number,
): number {
  const floor = floorSec * 1000;
  if (!budget || budget.remaining > 100) return floor;
  const untilReset = Math.max(0, budget.resetAtMs - now);
  if (budget.remaining <= 5) return Math.max(floor, untilReset);
  return Math.max(floor, untilReset / budget.remaining);
}
