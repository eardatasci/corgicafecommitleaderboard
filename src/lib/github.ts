import type { User } from "@prisma/client";
import { config } from "./config";
import { decryptToken } from "./crypto";
import { noteRateBudget } from "./poll-schedule";

export interface GithubViewer {
  id: number;
  login: string;
  avatarUrl: string;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.githubClientId,
    redirect_uri: `${config.baseUrl}/auth/github/callback`,
    scope: "read:user",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error(`token exchange failed: ${data.error ?? "no token"}`);
  return data.access_token;
}

export async function fetchViewer(accessToken: string): Promise<GithubViewer> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error(`GET /user failed: ${res.status}`);
  const data = await res.json();
  return { id: data.id, login: data.login, avatarUrl: data.avatar_url };
}

const CONTRIBUTIONS_QUERY = `
  query {
    viewer {
      contributionsCollection {
        totalCommitContributions
        restrictedContributionsCount
      }
    }
    rateLimit {
      remaining
      resetAt
    }
  }
`;

/**
 * The score counter: public commit contributions + private contributions
 * (GitHub's catch-all restricted count — commits plus private issues/PRs/
 * reviews; commits-only purity for private repos is not obtainable).
 *
 * Queried without a window (GitHub's rolling last-year default). Session
 * deltas diff this counter at both boundaries, so the wide window is fine:
 * the counter is monotonic within a session, and decreases are clamped.
 */
export async function fetchContributionCount(accessToken: string): Promise<number> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: CONTRIBUTIONS_QUERY }),
  });
  if (!res.ok) throw new Error(`GraphQL failed: ${res.status}`);
  const data = await res.json();
  const rl = data?.data?.rateLimit;
  if (rl) {
    noteRateBudget({
      remaining: rl.remaining,
      resetAtMs: new Date(rl.resetAt).getTime(),
    });
  }
  const col = data?.data?.viewer?.contributionsCollection;
  if (!col) throw new Error(`GraphQL error: ${JSON.stringify(data.errors ?? data)}`);
  return col.totalCommitContributions + col.restrictedContributionsCount;
}

export async function fetchContributionCountForUser(user: User): Promise<number> {
  return fetchContributionCount(decryptToken(user.encAccessToken));
}
