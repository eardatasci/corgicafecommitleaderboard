import { config } from "./config";
import { pollOpenSessions, sweepStaleSessions } from "./presence";

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

  setInterval(() => {
    pollOpenSessions().catch((err) => console.error("poll failed:", err));
  }, config.sessionPollSec * 1_000).unref();
}
