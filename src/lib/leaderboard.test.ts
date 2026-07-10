import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { handleHeartbeat } from "./presence";
import { getLeaderboard } from "./leaderboard";

const CORGI = "203.0.113.7";
let nextGithubId = 5000;

async function makeUser(username: string, totalCommits: number) {
  return db.user.create({
    data: {
      githubId: nextGithubId++,
      username,
      avatarUrl: "https://example.com/a.png",
      encAccessToken: "x.x.x",
      totalCommits,
    },
  });
}

beforeEach(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe("getLeaderboard", () => {
  it("ranks all-time by total commits and lists who is here now with live deltas", async () => {
    const alice = await makeUser("alice", 30);
    await makeUser("bob", 80);
    const carol = await makeUser("carol", 55);

    // alice and carol are in the cafe; alice has made 4 commits this session
    await handleHeartbeat(alice.id, CORGI, { fetchCount: async () => 100 });
    await db.session.updateMany({
      where: { userId: alice.id },
      data: { currentCount: 104, commits: 4 },
    });
    await handleHeartbeat(carol.id, CORGI, { fetchCount: async () => 200 });

    const board = await getLeaderboard();

    // all-time includes live open-session deltas (alice: 30 closed + 4 live)
    expect(board.allTime.map((u) => u.username)).toEqual(["bob", "carol", "alice"]);
    expect(board.allTime.map((u) => u.totalCommits)).toEqual([80, 55, 34]);

    expect(board.hereNow.map((u) => u.username)).toEqual(["alice", "carol"]);
    expect(board.hereNow[0].sessionCommits).toBe(4);
    expect(board.hereNow[1].sessionCommits).toBe(0);
  });

  it("re-ranks all-time when a live session overtakes a closed total", async () => {
    const alice = await makeUser("alice", 10);
    await makeUser("bob", 12);
    await handleHeartbeat(alice.id, CORGI, { fetchCount: async () => 100 });
    await db.session.updateMany({
      where: { userId: alice.id },
      data: { currentCount: 105, commits: 5 },
    });

    const board = await getLeaderboard();
    expect(board.allTime.map((u) => u.username)).toEqual(["alice", "bob"]);
    expect(board.allTime[0].totalCommits).toBe(15);
  });

  it("excludes closed sessions from here-now", async () => {
    const alice = await makeUser("alice", 0);
    await handleHeartbeat(alice.id, CORGI, { fetchCount: async () => 10 });
    await handleHeartbeat(alice.id, "198.51.100.9", { fetchCount: async () => 12 });

    const board = await getLeaderboard();
    expect(board.hereNow).toHaveLength(0);
    expect(board.allTime[0].totalCommits).toBe(2);
  });
});
