# Corgi Cafe Commit Leaderboard (CCCL) — Design

**Date:** 2026-07-09
**Status:** Approved design, ready for implementation planning

## Summary

A fun leaderboard for goers of the Corgi Cafe — a 24-hour cafe for tech people in
SF. Users log in with GitHub, get verified as physically present in the cafe via
their network's public IP, and rack up a score equal to the GitHub commits they
make **while present**. The board shows an all-time cumulative ranking plus a live
"who's here right now" panel. Leaving the cafe is detected automatically.

## Goals

1. **Login / auth** — link a GitHub account.
2. **Verify presence** — confirm the user is physically IN the Corgi Cafe.
3. **Leaderboard** — display rankings (all-time + live).
4. **Detect departure** — know automatically when a user is OUT of the cafe.

## Non-goals (v1)

- Blocking WiFi "freeloaders" (someone on Corgi's network from outside). Accepted
  risk for v1; a QR second-factor can be added later if it becomes a real problem.
- Commits-only purity for private repos (GitHub does not expose this — see below).
- Cafe kiosk / big-screen display mode. Web app on personal devices only for v1.
- Real-time push (SSE/WebSockets). Polling is sufficient for v1.

## Core metric

**Score = GitHub commit-contributions accrued while verified present in the cafe.**

Because commits happen via `git push` to GitHub (not through our app), we correlate
GitHub's own contribution counter against each user's verified presence window using
a **counter-delta** method (see Commit Counting).

### What "commits" means, honestly

We read GitHub's GraphQL `contributionsCollection`:

- `totalCommitContributions` — the user's **public** commit contributions.
- `restrictedContributionsCount` — a **catch-all** count of the user's **private**
  contributions (commits **plus** private issues, PRs, and reviews). GitHub
  deliberately does **not** let this be broken apart, and commits-only purity for
  private repos is **not obtainable** via any API.

Our counter is therefore:

```
count = totalCommitContributions + restrictedContributionsCount
```

The metric is honestly labeled in the UI as **"public commits + private
contributions"**, not "commits." This is a deliberate, documented tradeoff — it is
the price of counting private work without requesting repository read access.

## Architecture

**Stack:** Next.js (App Router + API routes), TypeScript front-to-back. SQLite via
Prisma for v1, swappable to Postgres on deploy.

**Hosting:** Fly.io or Render — a always-on server is required for (a) the stale-
session sweep that marks users OUT after a heartbeat timeout, and (b) a stable
trusted proxy for real client-IP reads. **Vercel serverless is a poor fit** for the
background sweep and is not recommended.

### Components

1. **Auth (GitHub OAuth)**
2. **Presence detection (public-IP heartbeat)**
3. **Commit counting (session-boundary counter deltas)**
4. **Leaderboard (read API + responsive web UI)**

Each is described below with its purpose, interface, and dependencies.

---

### 1. Auth — GitHub OAuth

- **What it does:** links a GitHub account and establishes a logged-in server
  session.
- **How it's used:** GitHub OAuth App with `scope=read:user`. Standard flow:
  `GET /auth/github` → GitHub authorize → `GET /auth/github/callback?code=...` →
  exchange code for token at `https://github.com/login/oauth/access_token`.
- On first login, create a `user` row. The **access token is encrypted at rest**
  (AES-256-GCM using a server-side key from env; never stored plaintext).
- An httpOnly, secure session cookie identifies the logged-in user on subsequent
  heartbeat/read calls.
- **Depends on:** `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TOKEN_ENC_KEY` env
  vars; the `users` table.

The `read:user` scope is the **only** permission requested — no repo access. This is
what makes private contribution counts available while keeping the consent screen
non-scary. A user who declines private-contribution sharing simply gets public-only
counting; everything still works.

---

### 2. Presence — public-IP heartbeat

- **What it does:** decides whether a user is IN or OUT of the cafe, and drives
  session open/close.
- **Config:** `CORGI_IPS` — an allowlist of the cafe router's public IP(s).
- **How it's used:** the open browser tab POSTs `POST /api/heartbeat` every **~45s**.
  The server determines the **real client IP** from the trusted reverse proxy's
  `X-Forwarded-For` (proxy configured so clients cannot spoof it).
  - **IN:** heartbeat originates from an IP in `CORGI_IPS`. If the user has no open
    session, this **opens** one (triggering a check-in count snapshot).
  - **OUT:** either (a) a heartbeat arrives from a non-Corgi IP, or (b) **no
    heartbeat for 5 minutes** (grace window absorbs closed laptops and throttled
    background tabs). A periodic server **sweep** closes sessions whose
    `last_seen_at` is older than the timeout.
- **Depends on:** trusted-proxy config (real IP), the `sessions` table, the commit-
  counting module (to snapshot on open/close).

**IP spoofing note:** only the proxy-appended client IP is trusted. The number of
`X-Forwarded-For` hops the app trusts must be pinned to the known proxy so a client
cannot inject a fake Corgi IP.

---

### 3. Commit counting — session-boundary counter deltas

- **What it does:** computes how many contributions a user made during a cafe
  session, including private ones, without seeing commit details.
- **How it's used:**
  - **On check-in (session open):** query `contributionsCollection` for the user →
    store `start_count = totalCommitContributions + restrictedContributionsCount`.
  - **During the session (poll ~every 3 min) and on check-out (session close):**
    re-query → `current_count`.
  - **Session commits = `max(0, current_count − start_count)`.** The clamp handles
    counter decreases from force-push, deleted commits, or a rolling query window.
  - On session close, the session's final `commits` is added to the user's
    denormalized `total_commits`.
- **Query window:** scope each query with `contributionsCollection(from, to)` around
  the session. **Fallback:** if sub-day `from`/`to` precision proves unreliable,
  sample a **fixed wide window** (e.g. rolling 24h) at both boundaries and diff — the
  delta is correct regardless of precision because the counter is monotonic within
  the window.
- **Depends on:** the user's decrypted access token, GitHub GraphQL endpoint
  (`https://api.github.com/graphql`), the `sessions` table.

**Rate limits:** the GraphQL API allows 5000 points/hour per token; we query a
handful of times per session, so this is a non-issue.

**Anti-gaming note:** the contribution graph places commits by **author date**.
Backdating a commit moves it *out of* the session window rather than inflating it, so
the simplest gaming attempt works against the cheater. Sufficient for a fun board.

---

### 4. Leaderboard — read API + web UI

- **What it does:** shows rankings.
- **How it's used:** a public, responsive web page polls `GET /api/leaderboard`
  every **~20s**.
  - **🏆 All-time:** `SUM(session.commits)` per user, read from the denormalized
    `user.total_commits` for fast reads.
  - **🟢 Here now:** users with an `open` session, plus their live session delta
    (`current_count − start_count`).
- **Depends on:** the `users` and `sessions` tables.

---

## Data model

```
users
-----
id                 (pk)
github_id          (unique)
username
avatar_url
enc_access_token   (AES-256-GCM ciphertext)
total_commits      (denormalized sum of closed-session commits)
created_at

sessions
--------
id                 (pk)
user_id            (fk -> users.id)
started_at
ended_at           (nullable; set on close)
start_count        (contribution counter at check-in)
current_count      (latest contribution counter)
commits            (max(0, current_count - start_count))
last_seen_at       (updated on each heartbeat; drives the OUT sweep)
last_ip            (most recent heartbeat source IP)
status             (open | closed)
```

**Invariant:** at most one `open` session per user. Heartbeats from any device
refresh the same open session.

## Data flow

1. User logs in via GitHub OAuth → `user` row created/updated, token encrypted.
2. Browser tab heartbeats every 45s.
3. First heartbeat from a Corgi IP → open a `session`, snapshot `start_count`.
4. Ongoing heartbeats refresh `last_seen_at`; a poller updates `current_count` and
   `commits` every ~3 min.
5. Heartbeat from non-Corgi IP **or** 5-min silence → sweep closes the session,
   final `commits` folds into `user.total_commits`.
6. Leaderboard page polls the read API and renders all-time + here-now.

## Error handling & edge cases

- **Counter decreases** (force-push / deleted commits) → delta clamped to ≥ 0.
- **Tab throttling / laptop sleep** → 5-minute grace window before marking OUT.
- **Sub-day API precision flaky** → fixed wide-window diff fallback.
- **IP spoofing** → only the trusted-proxy client IP is honored.
- **Declined private sharing / `read:user`** → private contributions simply don't
  count; public-only still works.
- **24h cafe / midnight crossover** → session-based accounting, so no timezone or
  calendar-day boundary bugs.
- **GitHub API error/timeout mid-session** → skip that poll; the next successful
  poll (or the close snapshot) recomputes the delta from `start_count`, so no double
  counting.
- **Multiple devices/tabs** → single open session per user; any device's heartbeat
  refreshes it.

## Testing strategy

- **Unit:**
  - delta computation, including the `max(0, …)` clamp on counter decrease;
  - IP-presence classification (IP in/out of `CORGI_IPS`, spoofed `X-Forwarded-For`);
  - session state machine (open on first Corgi heartbeat, refresh, close on non-Corgi
    heartbeat, close on timeout sweep).
- **Integration** (GitHub GraphQL mocked):
  - OAuth callback creates/updates a user and encrypts the token;
  - heartbeat transitions drive session open/close correctly;
  - leaderboard aggregation returns correct all-time and here-now results.

## Configuration

| Env var | Purpose |
|---|---|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth App credentials |
| `TOKEN_ENC_KEY` | AES key for access-token encryption at rest |
| `CORGI_IPS` | Allowlist of the cafe router's public IP(s) |
| `HEARTBEAT_TIMEOUT_MIN` | Grace window before marking OUT (default 5) |
| `SESSION_POLL_MIN` | Interval for in-session contribution re-query (default 3) |

## Future extensions (explicitly out of scope for v1)

- QR-code second factor to defeat WiFi freeloaders.
- Cafe big-screen kiosk mode.
- Weekly/seasonal leaderboards alongside all-time.
- SSE/WebSocket live updates instead of polling.
