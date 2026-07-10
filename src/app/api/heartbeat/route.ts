import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { resolveClientIp } from "@/lib/ip";
import { handleHeartbeat } from "@/lib/presence";
import { lazySweep } from "@/lib/jobs";

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  await lazySweep();

  const result = await handleHeartbeat(userId, resolveClientIp(req.headers));
  return NextResponse.json({
    present: result.present,
    sessionCommits: result.session?.commits ?? 0,
    sessionStatus: result.session?.statusText ?? null,
    sessionSince: result.session?.startedAt.toISOString() ?? null,
  });
}
