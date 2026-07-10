import { db } from "./db";

export interface AllTimeEntry {
  username: string;
  avatarUrl: string;
  totalCommits: number;
}

export interface HereNowEntry {
  username: string;
  avatarUrl: string;
  sessionCommits: number;
  since: Date;
}

export interface Leaderboard {
  allTime: AllTimeEntry[];
  hereNow: HereNowEntry[];
}

export async function getLeaderboard(): Promise<Leaderboard> {
  const [users, openSessions] = await Promise.all([
    db.user.findMany({
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        totalCommits: true,
        createdAt: true,
      },
    }),
    db.session.findMany({
      where: { status: "open" },
      orderBy: [{ commits: "desc" }, { startedAt: "asc" }],
      include: { user: { select: { username: true, avatarUrl: true } } },
    }),
  ]);

  // All-time = closed-session totals plus the live delta of an open session,
  // so the board always agrees with the "here now" panel.
  const liveByUser = new Map(openSessions.map((s) => [s.userId, s.commits]));
  const allTime = users
    .map((u) => ({
      username: u.username,
      avatarUrl: u.avatarUrl,
      totalCommits: u.totalCommits + (liveByUser.get(u.id) ?? 0),
      createdAt: u.createdAt,
    }))
    .sort(
      (a, b) =>
        b.totalCommits - a.totalCommits ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    )
    .slice(0, 100)
    .map(({ username, avatarUrl, totalCommits }) => ({
      username,
      avatarUrl,
      totalCommits,
    }));

  return {
    allTime,
    hereNow: openSessions.map((s) => ({
      username: s.user.username,
      avatarUrl: s.user.avatarUrl,
      sessionCommits: s.commits,
      since: s.startedAt,
    })),
  };
}
