import { getLeaderboard } from "./leaderboard";

// In-memory SSE hub (single instance on the free tier). Survives dev HMR via
// globalThis. Board mutations call notifyBoardChanged(); connected clients
// get the new board pushed as one JSON payload.

type Listener = (payload: string) => void;

const state = globalThis as unknown as {
  ccclListeners?: Set<Listener>;
  ccclNotifyTimer?: ReturnType<typeof setTimeout> | null;
  ccclLastPayload?: string;
};

function listeners(): Set<Listener> {
  return (state.ccclListeners ??= new Set());
}

export function subscribe(listener: Listener): () => void {
  listeners().add(listener);
  return () => listeners().delete(listener);
}

export async function currentBoardPayload(): Promise<string> {
  return JSON.stringify(await getLeaderboard());
}

/**
 * Recompute the board and push it to all connected clients. Debounced so a
 * burst of mutations (a sweep closing several sessions) broadcasts once;
 * skipped when the board serializes identically to the last push.
 */
export function notifyBoardChanged(): void {
  if (state.ccclNotifyTimer) return;
  const timer = setTimeout(async () => {
    state.ccclNotifyTimer = null;
    if (listeners().size === 0) return;
    try {
      const payload = await currentBoardPayload();
      if (payload === state.ccclLastPayload) return;
      state.ccclLastPayload = payload;
      for (const listener of listeners()) {
        try {
          listener(payload);
        } catch {
          // a dead client's listener is removed when its stream cancels
        }
      }
    } catch (err) {
      console.error("board broadcast failed:", err);
    }
  }, 150);
  timer.unref?.();
  state.ccclNotifyTimer = timer;
}
