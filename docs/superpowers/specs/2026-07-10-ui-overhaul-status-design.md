# Corgi Cafe UI Overhaul — Pages, Centered Receipt, and "What are you working on today?"

**Date:** 2026-07-10
**Status:** Approved

## Goal

Make the cafe board a place where people share what they're working on, not just a
scoreboard. Three changes:

1. Move the All-time board to its own page behind a navbar.
2. Center the "Now brewing" receipt on the home page and let it scale with the
   number of people checked in.
3. Add a per-visit "What are you working on today?" status, revealed by hovering
   a person on the receipt.

## Decisions (from brainstorming)

- **When to ask:** at each cafe check-in (new open presence session), not at
  GitHub sign-in. The previous status is carried over as a pre-fill so a regular
  can keep it with one click.
- **Prompt UI:** a dismissible inline banner above the receipt — non-blocking,
  no modal.
- **Hover scope:** statuses show on hover only on the "Now brewing" receipt.
  The All-time page stays clean; statuses are about today, not history.
- **Receipt scaling:** single column that grows taller with entries; width steps
  up at occupancy thresholds so a busy cafe reads as a long, impressive receipt.
- **Storage:** status lives on the `Session` row (a status is "what this visit
  is about"), with a carry-over copy on `User` for pre-fill. No history table.

## Data model

- `Session.statusText String?` — what the person said they're working on this
  visit. Null until they answer.
- `User.lastStatusText String?` — the most recently saved status, used only to
  pre-fill the prompt on the next visit. Updated every time a status is saved.

Statuses are plain text, trimmed, max 140 characters (server-enforced clamp).
Migration added for the SQLite schema and mirrored in
`prisma/schema.postgres.prisma`.

## API

- **`POST /api/status`** (auth required). Body: `{ text: string }`.
  - Caller has an open session → trim/clamp text, write it to
    `session.statusText` and `user.lastStatusText`, return the saved text.
  - No open session → `409` ("not at the cafe"). You can only say what you're
    working on while you're actually here.
  - Empty text after trimming → clears `session.statusText` (does not clear
    `lastStatusText`).
- **`GET /api/me`** additionally returns:
  - `sessionStatus: string | null` — this visit's status.
  - `lastStatusText: string | null` — pre-fill for the prompt.
- **`GET /api/leaderboard`** — `hereNow` entries gain `statusText: string | null`.

## Pages and navbar

`layout.tsx` renders a slim navbar shared by all pages:

- Left: "Corgi Cafe" wordmark (links to `/`).
- Center/left nav links: **Cafe** (`/`) and **All-time** (`/all-time`), with an
  active-link indicator.
- Right: auth area — presence chip, avatar, sign out (or "Sign in with GitHub").

The header/auth markup currently inside `page.tsx` moves into shared client
components. The data plumbing (leaderboard poll every 20s, `/api/me`, heartbeat
every 45s + visibility handler) moves into a shared client context/provider so
the navbar chip and both pages consume one set of pollers instead of
duplicating them.

### `/` — Cafe (home)

- The receipt is centered and is the page's centerpiece.
- Width steps by occupancy: ~24rem base, ~30rem at 10+ people, ~34rem at 20+,
  with a CSS transition between steps. Height grows naturally with entries.
- Status banner (below) sits above the receipt.
- The existing footer copy (scoring + check-in explanation) stays on this page.

### `/all-time` — All-time board

- The existing All-time list, centered on its own page. Behavior unchanged
  (top 100, live-delta-inclusive totals, top-3 highlight).

## Status banner (home page)

Shown only when the viewer is present and their open session has no
`statusText`:

- Card above the receipt: "What are you working on today?", a text input
  pre-filled from `lastStatusText`, a Save button, and a quiet "skip" dismiss.
- Dismissal is per-visit: stored in `sessionStorage` keyed by the session's
  `since`/start timestamp, so it never nags within a visit but returns next
  visit.
- After saving, the banner collapses to a one-liner — "working on: <text>" with
  an edit affordance — so a status can be updated mid-visit.
- Save failure shows an inline "couldn't save — try again" message; input keeps
  its text.

## Hover reveal on the receipt

- Receipt entries whose `statusText` is set get a tooltip on hover and on
  keyboard focus, styled like a barista's pen note (small, slightly rotated).
- Entries with a status get a subtle visual cue (dotted underline) so people
  know there's something to hover.
- Entries without a status get no tooltip and no cue.
- Implemented with CSS (plus `tabindex`/`aria-describedby` for focus
  accessibility); no tooltip library.

## Error handling

- Status save: inline retry message (above).
- Everything else keeps the existing swallow-and-retry polling behavior.
- `POST /api/status` validates auth (401), presence (409), and clamps input;
  no other new failure surface.

## Testing

- Unit tests (vitest, alongside existing suites) for status logic:
  - saves to the open session and updates `lastStatusText`,
  - 409 when no open session,
  - trim + 140-char clamp,
  - empty text clears the session status but preserves `lastStatusText`,
  - leaderboard includes `statusText` in `hereNow`.
- UI verified manually against the demo seed (`prisma/seed-demo.mjs`).

## Out of scope

- Status history / "yesterday you worked on…".
- Statuses on the All-time page.
- Mobile tap-to-reveal beyond native focus behavior (statuses are hover/focus
  only in v1).
