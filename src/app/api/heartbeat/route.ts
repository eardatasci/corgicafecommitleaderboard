import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { config } from "@/lib/config";
import { clientIpFromXff } from "@/lib/ip";
import { handleHeartbeat } from "@/lib/presence";
import { lazySweep } from "@/lib/jobs";

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  await lazySweep();

  const ip =
    config.devFakeIp ??
    clientIpFromXff(req.headers.get("x-forwarded-for"), config.trustedProxyHops);

  const result = await handleHeartbeat(userId, ip);
  return NextResponse.json({
    present: result.present,
    sessionCommits: result.session?.commits ?? 0,
  });
}
