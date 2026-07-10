# Corgi Cafe Commit Leaderboard 🐾

A fun leaderboard for the Corgi Cafe — a 24-hour cafe for tech people in SF. Sign
in with GitHub, get verified as physically present via the cafe's public IP, and
rack up a score equal to the GitHub contributions you make **while you're here**.

Design doc: [`docs/superpowers/specs/2026-07-09-corgi-cafe-commit-leaderboard-design.md`](docs/superpowers/specs/2026-07-09-corgi-cafe-commit-leaderboard-design.md)

## How it works

- **Auth** — GitHub OAuth with the `read:user` scope only (no repo access). Access
  tokens are encrypted at rest with AES-256-GCM.
- **Presence** — the open browser tab heartbeats every 45s. If the heartbeat's
  real client IP (from the trusted proxy's `X-Forwarded-For`) is in `CORGI_IPS`,
  you're in. Five minutes of silence, or a heartbeat from elsewhere, checks you out.
- **Score** — on check-in we snapshot GitHub's contribution counter
  (`totalCommitContributions + restrictedContributionsCount`); your session score
  is the counter delta, clamped at ≥ 0. Honestly labeled: it's *public commits +
  private contributions*, because GitHub doesn't break private activity down further.
- **Board** — all-time ranking (sum of closed-session scores) plus a live
  "now brewing" panel of who's checked in right now.

## Stack

Next.js (App Router) · TypeScript · Prisma + SQLite (swap to Postgres on deploy) ·
Tailwind · Vitest. No paid services anywhere: GitHub OAuth Apps and the GraphQL
API are free, and the app fits free hosting tiers (see Deploying).

## Local development

```bash
npm install
cp .env.example .env
# fill in:
#   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET  — create a (free) OAuth App at
#     https://github.com/settings/applications/new
#     callback URL: http://localhost:3000/auth/github/callback
#   TOKEN_ENC_KEY   — openssl rand -hex 32
#   DEV_FAKE_IP     — set to one of CORGI_IPS to simulate being in the cafe
npx prisma migrate dev
npm run dev
```

Optional demo data so the board isn't empty: `node prisma/seed-demo.mjs`

## Tests

```bash
npx vitest run
```

Unit tests cover the counter-delta clamp, IP/X-Forwarded-For spoof handling, and
crypto round-trips; integration tests drive the session state machine (open →
refresh → close → sweep) and leaderboard aggregation against a real SQLite db
with GitHub mocked.

## Configuration

| Env var | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file locally; Postgres URL in prod |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth App credentials |
| `TOKEN_ENC_KEY` | 32-byte hex key: token encryption + session-cookie signing |
| `CORGI_IPS` | Comma-separated public IP(s) of the cafe router |
| `TRUSTED_IP_HEADER` | Header the edge proxy overwrites with the real client IP (`true-client-ip` on Render); wins over hop counting |
| `TRUSTED_PROXY_HOPS` | Fallback: rightmost `X-Forwarded-For` entries you control (1 behind one proxy) |
| `BASE_URL` | Public URL of the app (OAuth redirects) |
| `HEARTBEAT_TIMEOUT_MIN` | Grace window before marking OUT (default 5) |
| `SESSION_POLL_MIN` | In-session contribution re-query interval (default 3) |
| `DEV_FAKE_IP` | Dev only: pretend heartbeats come from this IP. Never set in prod |

## Deploying (free tier)

The design calls for an always-on server, but the sweep that checks people out is
also run lazily (throttled) on every heartbeat/leaderboard request, so the app
stays correct on free hosts that spin down when idle — heartbeats keep it awake
while anyone is actually in the cafe.

Recommended free setup (this repo ships a [`render.yaml`](render.yaml) blueprint):

1. **Neon or Supabase free Postgres** — Render's free tier has no persistent
   disk, so SQLite won't survive deploys. Prod uses
   [`prisma/schema.postgres.prisma`](prisma/schema.postgres.prisma) (keep its
   models in sync with `schema.prisma`, which stays SQLite for dev/tests).
2. **Render** — New + → Blueprint → pick this repo. Render reads `render.yaml`,
   builds with `prisma db push` against the Postgres schema, and prompts for
   the secrets (`DATABASE_URL`, OAuth credentials, `TOKEN_ENC_KEY`, `CORGI_IPS`).
3. **Custom domain** — add it under the service's Settings → Custom Domains and
   create the DNS records Render shows you. HTTPS is automatic.
4. Point the prod GitHub OAuth App's callback at
   `https://<your-domain>/auth/github/callback` and set `BASE_URL` to match.
