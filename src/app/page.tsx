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
