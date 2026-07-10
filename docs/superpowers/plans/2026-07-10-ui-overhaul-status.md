# UI Overhaul + "What are you working on today?" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the All-time board to its own `/all-time` page behind a shared navbar, center the "Now brewing" receipt and make it scale with occupancy, and add a per-visit "What are you working on today?" status revealed on hover.

**Architecture:** Status lives on `Session.statusText` (per visit) with a carry-over copy on `User.lastStatusText` for pre-fill. A new `POST /api/status` writes both. On the client, the polling/heartbeat logic that lives in `page.tsx` today moves into a `CafeDataProvider` React context rendered from the root layout, so the navbar, home page, and all-time page share one set of pollers.

**Tech Stack:** Next.js 16.2 App Router (client components + route handlers), Prisma 6 (SQLite dev / Postgres prod), Tailwind 4 + custom CSS tokens, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-10-ui-overhaul-status-design.md`

## Global Constraints

- Statuses are plain text, trimmed, **max 200 characters** (server-enforced clamp).
- `POST /api/status` with no open session → **409** ("not at the cafe").
- Empty text after trimming clears `session.statusText` but **does not clear** `user.lastStatusText`.
- Statuses show on hover **only on the "Now brewing" receipt** — the All-time page stays clean.
- Receipt width steps: ~24rem base, ~30rem at 10+ people, ~34rem at 20+.
- Banner dismissal is per-visit: `sessionStorage`, keyed by the session's start timestamp.
- No tooltip library — CSS only, keyboard-focus accessible.
- This repo runs Next.js 16.2.10, newer than your training data. If an API behaves unexpectedly, read the guide in `node_modules/next/dist/docs/` before improvising. (`Link`, `usePathname`, route handlers, and `"use client"` were verified unchanged.)
- Existing code style: CSS variables via `style={{}}` for colors, Tailwind for layout, `// eslint-disable-next-line @next/next/no-img-element` above every `<img>`.
- Tests: `npx vitest run` (uses `prisma/test.db`, recreated per run via `prisma db push`, so schema changes need no test-side migration work).

---

### Task 1: Schema — `statusText` on Session, `lastStatusText` on User

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/schema.postgres.prisma`

**Interfaces:**
- Produces: `Session.statusText: string | null` and `User.lastStatusText: string | null` on the Prisma client, used by Tasks 2–5.

- [ ] **Step 1: Add the columns to the SQLite schema**

In `prisma/schema.prisma`, add to `model User` (after `totalCommits`):

```prisma
  lastStatusText String?  @map("last_status_text")
```

Add to `model Session` (after `status`):

```prisma
  statusText   String?   @map("status_text")
```

- [ ] **Step 2: Mirror both lines in the Postgres schema**

Make the same two edits in `prisma/schema.postgres.prisma` (same models, same positions). Render deploys with `prisma db push --schema prisma/schema.postgres.prisma`, so no Postgres migration file is needed.

- [ ] **Step 3: Apply to the dev database and regenerate the client**

Run:
```bash
npx prisma migrate dev --name add_status_text
```
Expected: "Your database is now in sync with your schema" and a new folder under `prisma/migrations/`. This also regenerates the Prisma client (`Session.statusText` / `User.lastStatusText` now type-check).

- [ ] **Step 4: Verify nothing broke**

Run: `npx vitest run`
Expected: all existing suites PASS (test DB is rebuilt from the schema automatically).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/schema.postgres.prisma prisma/migrations
git commit -m "Add statusText/lastStatusText columns for per-visit statuses"
```

---

### Task 2: `setStatus` domain logic (TDD)

**Files:**
- Create: `src/lib/status.ts`
- Test: `src/lib/status.test.ts`

**Interfaces:**
- Consumes: `Session.statusText`, `User.lastStatusText` (Task 1); `handleHeartbeat` from `src/lib/presence.ts` (test setup only).
- Produces: `STATUS_MAX_LEN = 200` and
  `setStatus(userId: number, rawText: string): Promise<{ ok: true; statusText: string | null } | { ok: false; reason: "not_present" }>`
  used by `POST /api/status` in Task 3.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/status.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { handleHeartbeat } from "./presence";
import { setStatus, STATUS_MAX_LEN } from "./status";

const CORGI = "203.0.113.7"; // in CORGI_IPS (vitest.config.ts)
let nextGithubId = 7000;

async function makeUser() {
  return db.user.create({
    data: {
      githubId: nextGithubId++,
      username: `user${nextGithubId}`,
      avatarUrl: "https://example.com/a.png",
      encAccessToken: "x.x.x",
    },
  });
}

async function checkIn(userId: number) {
  await handleHeartbeat(userId, CORGI, { fetchCount: async () => 10 });
}

beforeEach(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe("setStatus", () => {
  it("saves to the open session and carries over to lastStatusText", async () => {
    const user = await makeUser();
    await checkIn(user.id);

    const res = await setStatus(user.id, "  shipping the corgi cam  ");
    expect(res).toEqual({ ok: true, statusText: "shipping the corgi cam" });

    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.statusText).toBe("shipping the corgi cam");
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.lastStatusText).toBe("shipping the corgi cam");
  });

  it("refuses when there is no open session", async () => {
    const user = await makeUser();
    const res = await setStatus(user.id, "anything");
    expect(res).toEqual({ ok: false, reason: "not_present" });
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.lastStatusText).toBeNull();
  });

  it("clamps to 200 characters", async () => {
    const user = await makeUser();
    await checkIn(user.id);

    const res = await setStatus(user.id, "x".repeat(500));
    if (!res.ok) throw new Error("expected ok");
    expect(res.statusText).toHaveLength(STATUS_MAX_LEN);

    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.statusText).toHaveLength(200);
  });

  it("clears the session status on empty text but preserves lastStatusText", async () => {
    const user = await makeUser();
    await checkIn(user.id);
    await setStatus(user.id, "corgi cam");

    const res = await setStatus(user.id, "   ");
    expect(res).toEqual({ ok: true, statusText: null });

    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.statusText).toBeNull();
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.lastStatusText).toBe("corgi cam");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/status.test.ts`
Expected: FAIL — cannot resolve `./status`.

- [ ] **Step 3: Implement `setStatus`**

Create `src/lib/status.ts`:

```typescript
import { db } from "./db";

export const STATUS_MAX_LEN = 200;

export type SetStatusResult =
  | { ok: true; statusText: string | null }
  | { ok: false; reason: "not_present" };

/**
 * Save "what I'm working on" onto the caller's open session. The latest
 * non-empty status is also copied to the user as the pre-fill for their
 * next visit; clearing (empty text) leaves that carry-over intact.
 */
export async function setStatus(
  userId: number,
  rawText: string,
): Promise<SetStatusResult> {
  const text = rawText.trim().slice(0, STATUS_MAX_LEN).trimEnd();
  const open = await db.session.findFirst({ where: { userId, status: "open" } });
  if (!open) return { ok: false, reason: "not_present" };

  const statusText = text === "" ? null : text;
  await db.$transaction([
    db.session.update({ where: { id: open.id }, data: { statusText } }),
    ...(statusText
      ? [db.user.update({ where: { id: userId }, data: { lastStatusText: statusText } })]
      : []),
  ]);
  return { ok: true, statusText };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/status.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/status.ts src/lib/status.test.ts
git commit -m "Add setStatus: per-visit status with carry-over pre-fill"
```

---

### Task 3: Status in the leaderboard payload + API routes

**Files:**
- Modify: `src/lib/leaderboard.ts`
- Modify: `src/lib/leaderboard.test.ts`
- Create: `src/app/api/status/route.ts`
- Modify: `src/app/api/me/route.ts`
- Modify: `src/app/api/heartbeat/route.ts`

**Interfaces:**
- Consumes: `setStatus` (Task 2), `currentUserId` from `src/lib/auth.ts`.
- Produces (consumed by the client provider in Task 4):
  - `HereNowEntry` gains `statusText: string | null`.
  - `GET /api/me` user payload gains `sessionStatus: string | null`, `sessionSince: string | null` (ISO, open-session start — the banner's dismissal key), `lastStatusText: string | null`.
  - `POST /api/heartbeat` response gains `sessionStatus: string | null`, `sessionSince: string | null`.
  - `POST /api/status` — `{ text: string }` → 200 `{ statusText: string | null }`, 400 non-string, 401 unauthenticated, 409 not present.

- [ ] **Step 1: Write the failing leaderboard test**

In `src/lib/leaderboard.test.ts`, add inside `describe("getLeaderboard", ...)`:

```typescript
  it("includes each open session's statusText in here-now", async () => {
    const alice = await makeUser("alice", 0);
    const carol = await makeUser("carol", 0);
    await handleHeartbeat(alice.id, CORGI, { fetchCount: async () => 100 });
    await handleHeartbeat(carol.id, CORGI, { fetchCount: async () => 200 });
    await db.session.updateMany({
      where: { userId: alice.id },
      data: { statusText: "corgi cam firmware" },
    });

    const board = await getLeaderboard();
    expect(board.hereNow.map((u) => u.statusText)).toEqual([
      "corgi cam firmware",
      null,
    ]);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/leaderboard.test.ts`
Expected: FAIL — `statusText` is `undefined`, not `"corgi cam firmware"`.

- [ ] **Step 3: Add `statusText` to the leaderboard**

In `src/lib/leaderboard.ts`, add to `HereNowEntry`:

```typescript
export interface HereNowEntry {
  username: string;
  avatarUrl: string;
  sessionCommits: number;
  since: Date;
  statusText: string | null;
}
```

And in `getLeaderboard`'s return, extend the `hereNow` mapping:

```typescript
    hereNow: openSessions.map((s) => ({
      username: s.user.username,
      avatarUrl: s.user.avatarUrl,
      sessionCommits: s.commits,
      since: s.startedAt,
      statusText: s.statusText,
    })),
```

- [ ] **Step 4: Run the leaderboard tests to verify they pass**

Run: `npx vitest run src/lib/leaderboard.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Create `POST /api/status`**

Create `src/app/api/status/route.ts`:

```typescript
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
```

- [ ] **Step 6: Extend `GET /api/me`**

Replace the body of `GET` in `src/app/api/me/route.ts` so the selects and payload include the new fields:

```typescript
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ user: null });

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      avatarUrl: true,
      totalCommits: true,
      lastStatusText: true,
    },
  });
  if (!user) return NextResponse.json({ user: null });

  const open = await db.session.findFirst({
    where: { userId, status: "open" },
    select: { commits: true, startedAt: true, statusText: true },
  });

  return NextResponse.json({
    user: {
      ...user,
      present: Boolean(open),
      sessionCommits: open?.commits ?? 0,
      sessionStatus: open?.statusText ?? null,
      sessionSince: open?.startedAt.toISOString() ?? null,
    },
  });
}
```

- [ ] **Step 7: Extend `POST /api/heartbeat`'s response**

In `src/app/api/heartbeat/route.ts`, replace the final `return` with:

```typescript
  return NextResponse.json({
    present: result.present,
    sessionCommits: result.session?.commits ?? 0,
    sessionStatus: result.session?.statusText ?? null,
    sessionSince: result.session?.startedAt.toISOString() ?? null,
  });
```

- [ ] **Step 8: Verify the whole suite, lint, and types**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: all tests PASS, no lint or type errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/leaderboard.ts src/lib/leaderboard.test.ts src/app/api
git commit -m "Expose per-visit status via /api/status, /api/me, heartbeat, leaderboard"
```

---

### Task 4: Shared data provider, navbar, and `/all-time` page

**Files:**
- Create: `src/components/cafe-data.tsx`
- Create: `src/components/navbar.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/app/all-time/page.tsx`

**Interfaces:**
- Consumes: API shapes from Task 3.
- Produces (consumed by Task 5):
  - `useCafeData(): { board: Board | null; me: Me | null; loaded: boolean; setSessionStatus: (statusText: string | null) => void }`
  - Types `Board`, `AllTimeEntry`, `HereNowEntry { username; avatarUrl; sessionCommits; since: string; statusText: string | null }`, `Me { username; avatarUrl; totalCommits; present; sessionCommits; sessionStatus: string | null; sessionSince: string | null; lastStatusText: string | null }` — all exported from `src/components/cafe-data.tsx`.

- [ ] **Step 1: Create the provider**

Create `src/components/cafe-data.tsx` (this is the polling/heartbeat logic lifted from today's `page.tsx`, plus the new status fields):

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface AllTimeEntry {
  username: string;
  avatarUrl: string;
  totalCommits: number;
}

export interface HereNowEntry {
  username: string;
  avatarUrl: string;
  sessionCommits: number;
  since: string;
  statusText: string | null;
}

export interface Board {
  allTime: AllTimeEntry[];
  hereNow: HereNowEntry[];
}

export interface Me {
  username: string;
  avatarUrl: string;
  totalCommits: number;
  present: boolean;
  sessionCommits: number;
  sessionStatus: string | null;
  sessionSince: string | null;
  lastStatusText: string | null;
}

interface CafeData {
  board: Board | null;
  me: Me | null;
  loaded: boolean;
  setSessionStatus: (statusText: string | null) => void;
}

const LEADERBOARD_POLL_MS = 20_000;
const HEARTBEAT_MS = 45_000;

const CafeDataContext = createContext<CafeData | null>(null);

export function useCafeData(): CafeData {
  const data = useContext(CafeDataContext);
  if (!data) {
    throw new Error("useCafeData must be used inside CafeDataProvider");
  }
  return data;
}

export function CafeDataProvider({ children }: { children: React.ReactNode }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Leaderboard poll
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/leaderboard");
        if (res.ok) setBoard(await res.json());
      } catch {
        /* transient network error — next poll retries */
      }
    };
    load();
    const id = setInterval(load, LEADERBOARD_POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Who am I
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Heartbeat while logged in
  const loggedIn = Boolean(me);
  useEffect(() => {
    if (!loggedIn) return;
    const beat = async () => {
      try {
        const res = await fetch("/api/heartbeat", { method: "POST" });
        if (!res.ok) return;
        const d = await res.json();
        setMe((m) =>
          m
            ? {
                ...m,
                present: d.present,
                sessionCommits: d.sessionCommits,
                sessionStatus: d.sessionStatus,
                sessionSince: d.sessionSince,
              }
            : m,
        );
      } catch {
        /* transient network error — next beat retries */
      }
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loggedIn]);

  const setSessionStatus = useCallback((statusText: string | null) => {
    setMe((m) =>
      m
        ? {
            ...m,
            sessionStatus: statusText,
            lastStatusText: statusText ?? m.lastStatusText,
          }
        : m,
    );
  }, []);

  return (
    <CafeDataContext.Provider value={{ board, me, loaded, setSessionStatus }}>
      {children}
    </CafeDataContext.Provider>
  );
}
```

- [ ] **Step 2: Create the navbar**

Create `src/components/navbar.tsx` (the auth area is today's `Header`/`PresenceChip` from `page.tsx`, restyled for one slim bar):

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCafeData, type Me } from "./cafe-data";

export function Navbar() {
  const { me, loaded } = useCafeData();
  const pathname = usePathname();

  return (
    <nav className="border-b" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 sm:px-8">
        <Link href="/" className="font-display text-lg font-medium">
          Corgi Cafe
        </Link>

        <div className="font-data flex items-center gap-5 text-xs tracking-[0.15em] uppercase">
          <NavLink href="/" label="Cafe" active={pathname === "/"} />
          <NavLink
            href="/all-time"
            label="All-time"
            active={pathname === "/all-time"}
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          {me ? (
            <>
              <PresenceChip me={me} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={me.avatarUrl}
                alt={me.username}
                className="h-8 w-8 rounded-full border"
                style={{ borderColor: "var(--line)" }}
              />
              <form action="/auth/logout" method="post">
                <button
                  type="submit"
                  className="cursor-pointer text-xs underline-offset-2 hover:underline"
                  style={{ color: "var(--crema-dim)" }}
                >
                  Sign out
                </button>
              </form>
            </>
          ) : loaded ? (
            <a
              href="/auth/github"
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--fawn)", color: "var(--espresso)" }}
            >
              Sign in with GitHub
            </a>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={active ? "underline underline-offset-8" : "hover:underline underline-offset-8"}
      style={{ color: active ? "var(--fawn)" : "var(--crema-dim)" }}
    >
      {label}
    </Link>
  );
}

function PresenceChip({ me }: { me: Me }) {
  if (me.present) {
    return (
      <span
        className="font-data hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:flex"
        style={{ borderColor: "var(--matcha)", color: "var(--matcha)" }}
      >
        <span className="pulse-dot" />
        checked in · +{me.sessionCommits} this visit
      </span>
    );
  }
  return (
    <span
      className="font-data hidden rounded-full border px-3 py-1.5 text-xs sm:block"
      style={{ borderColor: "var(--line)", color: "var(--crema-dim)" }}
    >
      not at the cafe
    </span>
  );
}
```

- [ ] **Step 3: Mount provider + navbar in the root layout**

In `src/app/layout.tsx`, add the imports and wrap the body content. The layout stays a server component; only its children are client components:

```tsx
import { CafeDataProvider } from "@/components/cafe-data";
import { Navbar } from "@/components/navbar";
```

and change the `<body>` to:

```tsx
      <body className="min-h-full flex flex-col">
        <CafeDataProvider>
          <Navbar />
          {children}
        </CafeDataProvider>
      </body>
```

- [ ] **Step 4: Create the `/all-time` page**

Create `src/app/all-time/page.tsx` (the `AllTime` component moved out of today's `page.tsx`, consuming the provider, centered on its own page):

```tsx
"use client";

import { useCafeData, type AllTimeEntry } from "@/components/cafe-data";

export default function AllTimePage() {
  const { board } = useCafeData();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 sm:px-8">
      <section aria-label="All-time leaderboard">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-medium">All-time board</h2>
          <span
            className="font-data text-[0.65rem] tracking-wider uppercase"
            style={{ color: "var(--crema-dim)" }}
          >
            commits while here
          </span>
        </div>

        <ol className="mt-4 space-y-1.5">
          {!board ? (
            <li
              className="font-data py-8 text-center text-xs"
              style={{ color: "var(--crema-dim)" }}
            >
              loading…
            </li>
          ) : board.allTime.length === 0 ? (
            <li
              className="rounded-lg border border-dashed px-4 py-8 text-center text-sm"
              style={{ borderColor: "var(--line)", color: "var(--crema-dim)" }}
            >
              No commits on the board yet. Sign in, sit down, ship something.
            </li>
          ) : (
            board.allTime.map((e, i) => <Row key={e.username} entry={e} rank={i} />)
          )}
        </ol>
      </section>
    </div>
  );
}

function Row({ entry, rank }: { entry: AllTimeEntry; rank: number }) {
  const podium = rank < 3;
  return (
    <li
      className="flex items-center gap-3 rounded-lg border px-4 py-2.5"
      style={{
        background: podium ? "var(--roast)" : "var(--roast-deep)",
        borderColor: podium ? "var(--fawn-deep)" : "var(--line)",
      }}
    >
      <span
        className="font-data w-7 text-right text-sm tabular-nums"
        style={{ color: podium ? "var(--fawn)" : "var(--crema-dim)" }}
      >
        {rank + 1}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={entry.avatarUrl}
        alt=""
        className="h-8 w-8 rounded-full border"
        style={{ borderColor: "var(--line)" }}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {entry.username}
      </span>
      <span
        className="font-data text-base tabular-nums"
        style={{ color: podium ? "var(--fawn)" : "var(--crema)" }}
      >
        {entry.totalCommits}
      </span>
    </li>
  );
}
```

> Note: `src/app/page.tsx` still has its own header and pollers at this point; it double-polls harmlessly until Task 5 replaces it. Don't try to fix that here.

- [ ] **Step 5: Verify lint + types and check both pages render**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

Run `npm run dev` briefly and load `http://localhost:3000/` and `http://localhost:3000/all-time`: navbar shows on both, All-time list renders on `/all-time`, active link highlights. (Seed content: `node prisma/seed-demo.mjs`.)

- [ ] **Step 6: Commit**

```bash
git add src/components src/app/layout.tsx src/app/all-time
git commit -m "Add shared cafe-data provider, navbar, and /all-time page"
```

---

### Task 5: Home page — centered scaling receipt, hover notes, status banner

**Files:**
- Create: `src/components/status-banner.tsx`
- Modify: `src/app/page.tsx` (full rewrite)
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `useCafeData`, `HereNowEntry`, `Me` (Task 4); `POST /api/status` (Task 3).
- Produces: final UI; nothing downstream.

- [ ] **Step 1: Add receipt-scaling and pen-note CSS**

Append to `src/app/globals.css`:

```css
/* --- receipt scaling (width steps with occupancy) --------------------- */

.receipt-wrap {
  transition: max-width 0.6s ease;
}

/* --- barista pen notes (status tooltips on the receipt) --------------- */

.receipt-row {
  position: relative;
}

.receipt-row .status-note {
  position: absolute;
  left: 2.25rem;
  bottom: calc(100% + 0.4rem);
  z-index: 10;
  width: max-content;
  max-width: min(18rem, 80vw);
  padding: 0.45rem 0.65rem;
  background: #fdf6e9;
  color: var(--receipt-ink);
  border: 1px solid rgba(51, 36, 26, 0.35);
  border-radius: 2px;
  box-shadow: 2px 3px 0 rgba(51, 36, 26, 0.18);
  font-size: 0.7rem;
  line-height: 1.45;
  transform: rotate(-2deg);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s ease;
  pointer-events: none;
}

.receipt-row:hover .status-note,
.receipt-row:focus-visible .status-note,
.receipt-row:focus-within .status-note {
  opacity: 1;
  visibility: visible;
}

.status-cue {
  text-decoration: underline dotted rgba(51, 36, 26, 0.5);
  text-underline-offset: 3px;
}
```

- [ ] **Step 2: Create the status banner**

Create `src/components/status-banner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useCafeData } from "./cafe-data";

/**
 * "What are you working on today?" — shown while present with no status
 * this visit. Skipping is remembered per visit (sessionStorage keyed by the
 * session start), so it never nags within one sitting.
 */
export function StatusBanner() {
  const { me, setSessionStatus } = useCafeData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  const dismissKey = me?.sessionSince
    ? `cccl-status-skip:${me.sessionSince}`
    : null;

  useEffect(() => {
    if (dismissKey) setDismissed(sessionStorage.getItem(dismissKey) === "1");
  }, [dismissKey]);

  if (!me?.present) return null;

  const showForm = editing || (!me.sessionStatus && !dismissed);

  if (!showForm) {
    if (!me.sessionStatus) return null;
    return (
      <div
        className="font-data mx-auto mb-6 flex w-full max-w-xl items-baseline justify-center gap-2 text-xs"
        style={{ color: "var(--crema-dim)" }}
      >
        <span className="truncate">
          working on: <span style={{ color: "var(--crema)" }}>{me.sessionStatus}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            setDraft(me.sessionStatus);
            setEditing(true);
          }}
          className="cursor-pointer shrink-0 underline underline-offset-2"
        >
          edit
        </button>
      </div>
    );
  }

  const value = draft ?? me.sessionStatus ?? me.lastStatusText ?? "";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const d = await res.json();
      setSessionStatus(d.statusText);
      setEditing(false);
      setDraft(null);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const dismiss = () => {
    if (!editing && dismissKey) sessionStorage.setItem(dismissKey, "1");
    setDismissed(true);
    setEditing(false);
    setDraft(null);
    setFailed(false);
  };

  return (
    <div
      className="mx-auto mb-6 w-full max-w-xl rounded-lg border p-4"
      style={{ background: "var(--roast)", borderColor: "var(--fawn-deep)" }}
    >
      <p className="font-display text-lg">What are you working on today?</p>
      <form onSubmit={save} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          placeholder="e.g. corgi cam firmware"
          autoFocus
          className="font-data min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--line)", color: "var(--crema)" }}
        />
        <button
          type="submit"
          disabled={saving}
          className="cursor-pointer rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--fawn)", color: "var(--espresso)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="cursor-pointer text-xs underline-offset-2 hover:underline"
          style={{ color: "var(--crema-dim)" }}
        >
          {editing ? "cancel" : "skip"}
        </button>
      </form>
      {failed ? (
        <p className="font-data mt-2 text-xs" style={{ color: "var(--fawn)" }}>
          couldn&apos;t save — try again
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite the home page**

Replace the entire contents of `src/app/page.tsx` with:

```tsx
"use client";

import { useCafeData, type HereNowEntry } from "@/components/cafe-data";
import { StatusBanner } from "@/components/status-banner";

function timeIn(since: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** The receipt widens as the cafe fills up: 24rem → 30rem (10+) → 34rem (20+). */
function receiptMaxWidth(count: number): string {
  if (count >= 20) return "34rem";
  if (count >= 10) return "30rem";
  return "24rem";
}

export default function Home() {
  const { board } = useCafeData();
  const entries = board?.hereNow;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8">
      <StatusBanner />

      <main
        className="receipt-wrap mx-auto w-full"
        style={{ maxWidth: receiptMaxWidth(entries?.length ?? 0) }}
      >
        <HereNow entries={entries} />
      </main>

      <footer
        className="mx-auto mt-14 w-full max-w-xl border-t pt-5 text-xs leading-relaxed"
        style={{ borderColor: "var(--line)", color: "var(--crema-dim)" }}
      >
        <p>
          Score = GitHub <strong>public commits + private contributions</strong>{" "}
          made while checked in at the cafe. GitHub doesn&apos;t break private activity down
          further, and we never ask for repo access — only{" "}
          <span className="font-data">read:user</span>.
        </p>
        <p className="mt-1">
          Check-in is automatic on the cafe wifi. Leave (or close your laptop for 5
          minutes) and you&apos;re checked out. Hover a name to see what they&apos;re
          working on.
        </p>
      </footer>
    </div>
  );
}

function HereNow({ entries }: { entries?: HereNowEntry[] }) {
  return (
    <section aria-label="Here now">
      <div className="receipt px-5 pt-5 pb-8">
        <p className="font-data text-center text-xs tracking-[0.3em] uppercase">
          ── Now brewing ──
        </p>
        <p
          className="font-data mt-1 text-center text-[0.65rem] tracking-wider"
          style={{ color: "rgba(51,36,26,0.55)" }}
        >
          live from the cafe wifi
        </p>
        <hr className="receipt-rule my-4" />

        {!entries ? (
          <p className="font-data py-6 text-center text-xs">loading…</p>
        ) : entries.length === 0 ? (
          <p
            className="font-data py-6 text-center text-xs leading-relaxed"
            style={{ color: "rgba(51,36,26,0.65)" }}
          >
            nobody&apos;s checked in.
            <br />
            the espresso machine is lonely.
          </p>
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => (
              <ReceiptRow key={e.username} entry={e} />
            ))}
          </ul>
        )}

        <hr className="receipt-rule my-4" />
        <p
          className="font-data text-center text-[0.65rem] tracking-wider"
          style={{ color: "rgba(51,36,26,0.55)" }}
        >
          commits this visit · updates every ~3 min
        </p>
      </div>
    </section>
  );
}

function ReceiptRow({ entry }: { entry: HereNowEntry }) {
  const noteId = entry.statusText ? `status-note-${entry.username}` : undefined;
  return (
    <li
      className="receipt-row font-data flex items-center gap-2.5 text-sm"
      tabIndex={entry.statusText ? 0 : undefined}
      aria-describedby={noteId}
    >
      <span className="pulse-dot shrink-0" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={entry.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
      <span
        className={`min-w-0 flex-1 truncate${entry.statusText ? " status-cue" : ""}`}
      >
        {entry.username}
      </span>
      <span className="text-[0.7rem]" style={{ color: "rgba(51,36,26,0.55)" }}>
        {timeIn(entry.since)}
      </span>
      <span className="font-semibold">+{entry.sessionCommits}</span>
      {entry.statusText ? (
        <span id={noteId} role="tooltip" className="status-note">
          {entry.statusText}
        </span>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 4: Verify lint + types + tests**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/status-banner.tsx src/app/globals.css
git commit -m "Center the receipt, scale it with occupancy, add status banner and hover notes"
```

---

### Task 6: Demo seed statuses + full verification

**Files:**
- Modify: `prisma/seed-demo.mjs`

**Interfaces:**
- Consumes: schema fields from Task 1. Nothing downstream.

- [ ] **Step 1: Seed statuses so the hover UI is demoable**

In `prisma/seed-demo.mjs`, add `statusText` to mochi's session `data` (the first `db.session.create`):

```javascript
    statusText: "rewriting the corgi cam firmware in rust",
```

Leave sploot's session without one (exercises the no-cue path). Also give mochi a carry-over status. The upsert loops over the `users` array with a shared `update` object, so put the value on mochi's array entry:

```javascript
const users = [
  { githubId: 900001, username: "mochi-ships", totalCommits: 128, lastStatusText: "rewriting the corgi cam firmware in rust" },
  { githubId: 900002, username: "ein-the-data-dog", totalCommits: 87 },
  { githubId: 900003, username: "stubby-stack", totalCommits: 55 },
  { githubId: 900004, username: "loaf-of-code", totalCommits: 31 },
  { githubId: 900005, username: "sploot-eng", totalCommits: 9 },
];
```

The existing `create: { ...u, ... }` and `update: { totalCommits: u.totalCommits }` lines then need:

```javascript
    update: { totalCommits: u.totalCommits, lastStatusText: u.lastStatusText ?? null },
```

- [ ] **Step 2: Manual verification pass**

```bash
node prisma/seed-demo.mjs
npm run dev
```

Check at `http://localhost:3000`:
1. Navbar on both pages; Cafe/All-time links switch pages with the active link in fawn.
2. `/`: receipt centered; mochi-ships has a dotted-underline name; hovering (and tabbing to) the row shows the rotated pen note; sploot-eng has no cue and no tooltip.
3. `/all-time`: board renders as before, no statuses anywhere.
4. Receipt width: temporarily edit `receiptMaxWidth` to threshold `>= 2` and confirm the receipt widens with a smooth transition, then revert.
5. Sign-in–dependent banner states (prompt, pre-fill, skip-per-visit, edit) need a real session + `DEV_FAKE_IP`; if the local OAuth app isn't configured, verify what's checkable and note the rest for the user.

- [ ] **Step 3: Full gate**

Run: `npx vitest run && npm run lint && npx tsc --noEmit && npm run build`
Expected: everything passes.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed-demo.mjs
git commit -m "Seed demo statuses for the hover notes"
```
