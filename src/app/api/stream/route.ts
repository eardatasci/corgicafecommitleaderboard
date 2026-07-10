import { subscribe, currentBoardPayload } from "@/lib/live";
import { lazySweep } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/**
 * SSE stream of leaderboard updates. Each event's data is the same JSON
 * /api/leaderboard returns; a snapshot is sent on connect, then pushes
 * arrive whenever the board changes. Comment pings keep proxies from
 * closing the idle connection.
 */
export async function GET() {
  await lazySweep();
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // stream already closed; cancel() handles cleanup
        }
      };
      send(await currentBoardPayload());
      const unsubscribe = subscribe(send);
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* closed */
        }
      }, 25_000);
      ping.unref?.();
      cleanup = () => {
        unsubscribe();
        clearInterval(ping);
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
