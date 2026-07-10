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
      orderBy: [{ totalCommits: "desc" }, { createdAt: "asc" }],
      take: 100,
      select: { username: true, avatarUrl: true, totalCommits: true },
    }),
    db.session.findMany({
      where: { status: "open" },
      orderBy: [{ commits: "desc" }, { startedAt: "asc" }],
      include: { user: { select: { username: true, avatarUrl: true } } },
    }),
  ]);

  return {
    allTime: users,
    hereNow: openSessions.map((s) => ({
      username: s.user.username,
      avatarUrl: s.user.avatarUrl,
      sessionCommits: s.commits,
      since: s.startedAt,
    })),
  };
}
