import { config } from "./config";
import { pollOpenSessions, sweepStaleSessions } from "./presence";
import { nextPollDelayMs, takeWorstRateBudget } from "./poll-schedule";

// The sweep runs two ways so free-tier hosts that spin down between requests
// stay correct: a timer while the server is up (instrumentation.ts), and
// lazily — throttled — before heartbeat/leaderboard reads.

const state = globalThis as unknown as {
  ccclLastSweep?: number;
  ccclTimersStarted?: boolean;
};

export async function lazySweep(): Promise<void> {
  const now = Date.now();
  if (state.ccclLastSweep && now - state.ccclLastSweep < 30_000) return;
  state.ccclLastSweep = now;
  try {
    await sweepStaleSessions();
  } catch (err) {
    console.error("sweep failed:", err);
  }
}

export function startBackgroundJobs(): void {
  if (state.ccclTimersStarted) return;
  state.ccclTimersStarted = true;

  setInterval(() => {
    lazySweep().catch(() => {});
  }, 60_000).unref();

  // Self-scheduling poll loop: runs at SESSION_POLL_SEC while every token has
  // rate budget, and stretches out automatically when one runs low.
  const pollLoop = async () => {
    try {
      await pollOpenSessions();
    } catch (err) {
      console.error("poll failed:", err);
    }
    const delay = nextPollDelayMs(
      config.sessionPollSec,
      takeWorstRateBudget(),
      Date.now(),
    );
    setTimeout(pollLoop, delay).unref();
  };
  setTimeout(pollLoop, config.sessionPollSec * 1_000).unref();
}
