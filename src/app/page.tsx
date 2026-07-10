"use client";

import { useEffect, useState } from "react";

interface AllTimeEntry {
  username: string;
  avatarUrl: string;
  totalCommits: number;
}

interface HereNowEntry {
  username: string;
  avatarUrl: string;
  sessionCommits: number;
  since: string;
}

interface Board {
  allTime: AllTimeEntry[];
  hereNow: HereNowEntry[];
}

interface Me {
  username: string;
  avatarUrl: string;
  totalCommits: number;
  present: boolean;
  sessionCommits: number;
}

// SSE delivers board changes instantly; the slow poll is a safety net for
// networks that block event streams.
const LEADERBOARD_FALLBACK_POLL_MS = 60_000;
const HEARTBEAT_MS = 45_000;

function timeIn(since: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function Home() {
  const [board, setBoard] = useState<Board | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Live board: SSE push, with a slow poll as fallback
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/stream");
      es.onmessage = (ev) => {
        try {
          setBoard(JSON.parse(ev.data));
        } catch {
          /* malformed frame — fallback poll still covers us */
        }
      };
    } catch {
      /* EventSource unavailable — fallback poll takes over */
    }
    const load = async () => {
      try {
        const res = await fetch("/api/leaderboard");
        if (res.ok) setBoard(await res.json());
      } catch {
        /* transient network error — next poll retries */
      }
    };
    load();
    const id = setInterval(load, LEADERBOARD_FALLBACK_POLL_MS);
    return () => {
      es?.close();
      clearInterval(id);
    };
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
          m ? { ...m, present: d.present, sessionCommits: d.sessionCommits } : m,
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

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8">
      <Header me={me} loaded={loaded} />

      <main className="mt-10 grid gap-8 md:grid-cols-[minmax(0,20rem)_1fr]">
        <HereNow entries={board?.hereNow} />
        <AllTime entries={board?.allTime} />
      </main>

      <footer
        className="mt-14 border-t pt-5 text-xs leading-relaxed"
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
          minutes) and you&apos;re checked out.
        </p>
      </footer>
    </div>
  );
}

function Header({ me, loaded }: { me: Me | null; loaded: boolean }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p
          className="font-data text-xs tracking-[0.25em] uppercase"
          style={{ color: "var(--fawn)" }}
        >
          Open 24h · San Francisco
        </p>
        <h1 className="font-display mt-2 text-4xl font-medium sm:text-5xl">
          Corgi Cafe
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--crema-dim)" }}>
          Ship from the cafe, climb the board.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {me ? (
          <>
            <PresenceChip me={me} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={me.avatarUrl}
              alt={me.username}
              className="h-9 w-9 rounded-full border"
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
            className="rounded-md px-4 py-2 text-sm font-medium transition-transform hover:-translate-y-0.5"
            style={{ background: "var(--fawn)", color: "var(--espresso)" }}
          >
            Sign in with GitHub
          </a>
        ) : null}
      </div>
    </header>
  );
}

function PresenceChip({ me }: { me: Me }) {
  if (me.present) {
    return (
      <span
        className="font-data flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
        style={{ borderColor: "var(--matcha)", color: "var(--matcha)" }}
      >
        <span className="pulse-dot" />
        checked in · +{me.sessionCommits} this visit
      </span>
    );
  }
  return (
    <span
      className="font-data rounded-full border px-3 py-1.5 text-xs"
      style={{ borderColor: "var(--line)", color: "var(--crema-dim)" }}
    >
      not at the cafe
    </span>
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
              <li key={e.username} className="font-data flex items-center gap-2.5 text-sm">
                <span className="pulse-dot shrink-0" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
                <span className="min-w-0 flex-1 truncate">{e.username}</span>
                <span
                  className="text-[0.7rem]"
                  style={{ color: "rgba(51,36,26,0.55)" }}
                >
                  {timeIn(e.since)}
                </span>
                <span className="font-semibold">+{e.sessionCommits}</span>
              </li>
            ))}
          </ul>
        )}

        <hr className="receipt-rule my-4" />
        <p
          className="font-data text-center text-[0.65rem] tracking-wider"
          style={{ color: "rgba(51,36,26,0.55)" }}
        >
          commits this visit · streamed live
        </p>
      </div>
    </section>
  );
}

function AllTime({ entries }: { entries?: AllTimeEntry[] }) {
  return (
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
        {!entries ? (
          <li
            className="font-data py-8 text-center text-xs"
            style={{ color: "var(--crema-dim)" }}
          >
            loading…
          </li>
        ) : entries.length === 0 ? (
          <li
            className="rounded-lg border border-dashed px-4 py-8 text-center text-sm"
            style={{ borderColor: "var(--line)", color: "var(--crema-dim)" }}
          >
            No commits on the board yet. Sign in, sit down, ship something.
          </li>
        ) : (
          entries.map((e, i) => (
            <li
              key={e.username}
              className="flex items-center gap-3 rounded-lg border px-4 py-2.5"
              style={{
                background: i < 3 ? "var(--roast)" : "var(--roast-deep)",
                borderColor: i < 3 ? "var(--fawn-deep)" : "var(--line)",
              }}
            >
              <span
                className="font-data w-7 text-right text-sm tabular-nums"
                style={{ color: i < 3 ? "var(--fawn)" : "var(--crema-dim)" }}
              >
                {i + 1}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full border"
                style={{ borderColor: "var(--line)" }}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {e.username}
              </span>
              <span
                className="font-data text-base tabular-nums"
                style={{ color: i < 3 ? "var(--fawn)" : "var(--crema)" }}
              >
                {e.totalCommits}
              </span>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
