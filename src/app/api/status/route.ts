import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { setStatus } from "@/lib/status";

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    text = undefined;
  }
  if (typeof text !== "string") {
    return NextResponse.json({ error: "text must be a string" }, { status: 400 });
  }

  const result = await setStatus(userId, text);
  if (!result.ok) {
    return NextResponse.json({ error: "not at the cafe" }, { status: 409 });
  }
  return NextResponse.json({ statusText: result.statusText });
}
