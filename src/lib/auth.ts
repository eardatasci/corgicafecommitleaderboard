import { cookies } from "next/headers";
import { verifySession } from "./crypto";

export const SESSION_COOKIE = "cccl_session";
export const STATE_COOKIE = "cccl_oauth_state";

/** Logged-in user id from the session cookie, or null. */
export async function currentUserId(): Promise<number | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90 days
  };
}
