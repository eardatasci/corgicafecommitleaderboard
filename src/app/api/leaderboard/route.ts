import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/leaderboard";
import { lazySweep } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  await lazySweep();
  const board = await getLeaderboard();
  return NextResponse.json(board);
}
