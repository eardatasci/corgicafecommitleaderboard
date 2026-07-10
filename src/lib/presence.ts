import type { Session, User } from "@prisma/client";
import { db } from "./db";
import { config } from "./config";
import { isCorgiIp } from "./ip";
import { sessionCommits } from "./delta";
import { fetchContributionCountForUser } from "./github";

export type FetchCount = (user: User) => Promise<number>;

interface Opts {
  now?: Date;
  fetchCount?: FetchCount;
}

function resolve(opts: Opts) {
  return {
    now: opts.now ?? new Date(),
    fetchCount: opts.fetchCount ?? fetchContributionCountForUser,
  };
}

/**
 * The presence state machine, driven by each heartbeat:
 * - Corgi IP, no open session → open one (snapshot start count).
 * - Corgi IP, open session    → refresh last-seen.
 * - Other IP, open session    → close it.
 */
export async function handleHeartbeat(
  userId: number,
  ip: string | null,
  opts: Opts = {},
): Promise<{ present: boolean; session?: Session }> {
  const { now, fetchCount } = resolve(opts);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { present: false };

  const open = await db.session.findFirst({ where: { userId, status: "open" } });

  if (!isCorgiIp(ip, config.corgiIps)) {
    if (open) await closeSession(open, { now, fetchCount });
    return { present: false };
  }

  if (open) {
    const session = await db.session.update({
      where: { id: open.id },
      data: { lastSeenAt: now, lastIp: ip as string },
    });
    return { present: true, session };
  }

  let count: number;
  try {
    count = await fetchCount(user);
  } catch {
    // Can't snapshot a start count — don't open a session this beat; the
    // next heartbeat retries. Opening without a snapshot would corrupt deltas.
    return { present: false };
  }
  const session = await db.session.create({
    data: {
      userId,
      startedAt: now,
      lastSeenAt: now,
      lastIp: ip as string,
      startCount: count,
      currentCount: count,
    },
  });
  return { present: true, session };
}

async function closeSession(
  session: Session,
  { now, fetchCount }: Required<Opts>,
): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: session.userId } });
  let finalCount = session.currentCount;
  try {
    finalCount = await fetchCount(user);
  } catch {
    // GitHub unavailable at close: fall back to the last successful poll.
  }
  const commits = sessionCommits(session.startCount, finalCount);
  await db.$transaction([
    db.session.update({
      where: { id: session.id },
      data: {
        status: "closed",
        endedAt: now,
        currentCount: finalCount,
        commits,
      },
    }),
    db.user.update({
      where: { id: user.id },
      data: { totalCommits: { increment: commits } },
    }),
  ]);
}

/**
 * Close sessions whose last heartbeat is older than the grace window.
 * Runs on a timer and lazily before reads, so it also works on free-tier
 * hosts that spin the server down between requests.
 */
export async function sweepStaleSessions(opts: Opts = {}): Promise<number> {
  const { now, fetchCount } = resolve(opts);
  const cutoff = new Date(now.getTime() - config.heartbeatTimeoutMin * 60_000);
  const stale = await db.session.findMany({
    where: { status: "open", lastSeenAt: { lt: cutoff } },
  });
  for (const session of stale) {
    await closeSession(session, { now, fetchCount });
  }
  return stale.length;
}

/** Refresh the live counter (and delta) of every open session. */
export async function pollOpenSessions(opts: Opts = {}): Promise<void> {
  const { fetchCount } = resolve(opts);
  const open = await db.session.findMany({
    where: { status: "open" },
    include: { user: true },
  });
  for (const session of open) {
    try {
      const count = await fetchCount(session.user);
      await db.session.update({
        where: { id: session.id },
        data: {
          currentCount: count,
          commits: sessionCommits(session.startCount, count),
        },
      });
    } catch {
      // Skip this poll; the next poll or the close snapshot recomputes the
      // delta from startCount, so nothing is double counted.
    }
  }
}
