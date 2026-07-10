import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.redirect(`${config.baseUrl}/`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
