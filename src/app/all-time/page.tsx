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
