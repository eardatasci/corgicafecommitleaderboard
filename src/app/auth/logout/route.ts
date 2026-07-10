import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.redirect(`${config.baseUrl}/`, 303);
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
