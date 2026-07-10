import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ user: null });

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      avatarUrl: true,
      totalCommits: true,
      lastStatusText: true,
    },
  });
  if (!user) return NextResponse.json({ user: null });

  const open = await db.session.findFirst({
    where: { userId, status: "open" },
    select: { commits: true, startedAt: true, statusText: true },
  });

  return NextResponse.json({
    user: {
      ...user,
      present: Boolean(open),
      sessionCommits: open?.commits ?? 0,
      sessionStatus: open?.statusText ?? null,
      sessionSince: open?.startedAt.toISOString() ?? null,
    },
  });
}
