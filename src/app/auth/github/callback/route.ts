import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchangeCodeForToken, fetchViewer } from "@/lib/github";
import { encryptToken, signSession } from "@/lib/crypto";
import { config } from "@/lib/config";
import { SESSION_COOKIE, STATE_COOKIE, sessionCookieOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${config.baseUrl}/?error=oauth_state`);
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const viewer = await fetchViewer(accessToken);

    const user = await db.user.upsert({
      where: { githubId: viewer.id },
      create: {
        githubId: viewer.id,
        username: viewer.login,
        avatarUrl: viewer.avatarUrl,
        encAccessToken: encryptToken(accessToken),
      },
      update: {
        username: viewer.login,
        avatarUrl: viewer.avatarUrl,
        encAccessToken: encryptToken(accessToken),
      },
    });

    const res = NextResponse.redirect(`${config.baseUrl}/`);
    res.cookies.set(SESSION_COOKIE, signSession(user.id), sessionCookieOptions());
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    console.error("OAuth callback failed:", err);
    return NextResponse.redirect(`${config.baseUrl}/?error=oauth_failed`);
  }
}
