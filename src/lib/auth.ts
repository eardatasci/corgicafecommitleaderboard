import { cookies } from "next/headers";
import { verifySession } from "./crypto";
import { config } from "./config";

export const SESSION_COOKIE = "cccl_session";
export const STATE_COOKIE = "cccl_oauth_state";

/** Logged-in user id from the session cookie, or null. */
export async function currentUserId(): Promise<number | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * Cookies are scoped to the BASE_URL domain (not host-only) so www and the
 * apex share the login session and the OAuth state survives the
 * www → apex redirect during the callback.
 */
export function cookieDomain(): string | undefined {
  try {
    const host = new URL(config.baseUrl).hostname;
    return host === "localhost" ? undefined : host.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    domain: cookieDomain(),
    maxAge: 60 * 60 * 24 * 90, // 90 days
  };
}
