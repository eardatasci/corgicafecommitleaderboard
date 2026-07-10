import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import {
  handleHeartbeat,
  sweepStaleSessions,
  pollOpenSessions,
} from "./presence";

const CORGI = "203.0.113.7"; // in CORGI_IPS (vitest.config.ts)
const ELSEWHERE = "198.51.100.9";

let nextGithubId = 1000;

async function makeUser(totalCommits = 0) {
  return db.user.create({
    data: {
      githubId: nextGithubId++,
      username: `user${nextGithubId}`,
      avatarUrl: "https://example.com/a.png",
      encAccessToken: "x.x.x",
      totalCommits,
    },
  });
}

const countOf = (n: number) => async () => n;
const failing = async (): Promise<number> => {
  throw new Error("github down");
};

beforeEach(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe("handleHeartbeat", () => {
  it("opens a session with a start-count snapshot on first Corgi heartbeat", async () => {
    const user = await makeUser();
    const res = await handleHeartbeat(user.id, CORGI, { fetchCount: countOf(50) });
    expect(res.present).toBe(true);

    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.status).toBe("open");
    expect(session.startCount).toBe(50);
    expect(session.currentCount).toBe(50);
    expect(session.commits).toBe(0);
    expect(session.lastIp).toBe(CORGI);
  });

  it("refreshes the existing open session instead of opening a second one", async () => {
    const user = await makeUser();
    await handleHeartbeat(user.id, CORGI, { fetchCount: countOf(50) });
    const later = new Date(Date.now() + 60_000);
    await handleHeartbeat(user.id, CORGI, { fetchCount: countOf(99), now: later });

    const sessions = await db.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].startCount).toBe(50); // snapshot not retaken
    expect(sessions[0].lastSeenAt.getTime()).toBe(later.getTime());
  });

  it("closes the session and folds commits into the all-time total on a non-Corgi heartbeat", async () => {
    const user = await makeUser(10);
    await handleHeartbeat(user.id, CORGI, { fetchCount: countOf(50) });
    const res = await handleHeartbeat(user.id, ELSEWHERE, { fetchCount: countOf(57) });
    expect(res.present).toBe(false);

    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.status).toBe("closed");
    expect(session.endedAt).not.toBeNull();
    expect(session.commits).toBe(7);

    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.totalCommits).toBe(17);
  });

  it("clamps a counter decrease to zero commits", async () => {
    const user = await makeUser(10);
    await handleHeartbeat(user.id, CORGI, { fetchCount: countOf(50) });
    await handleHeartbeat(user.id, ELSEWHERE, { fetchCount: countOf(40) });

    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.commits).toBe(0);
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.totalCommits).toBe(10);
  });

  it("does nothing for a non-Corgi heartbeat with no open session", async () => {
    const user = await makeUser();
    const res = await handleHeartbeat(user.id, ELSEWHERE, { fetchCount: countOf(1) });
    expect(res.present).toBe(false);
    expect(await db.session.count()).toBe(0);
  });

  it("falls back to the last known count when GitHub fails at close", async () => {
    const user = await makeUser();
    await handleHeartbeat(user.id, CORGI, { fetchCount: countOf(50) });
    await pollOpenSessions({ fetchCount: countOf(55) }); // last known: 55
    await handleHeartbeat(user.id, ELSEWHERE, { fetchCount: failing });

    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.status).toBe("closed");
    expect(session.commits).toBe(5);
  });

  it("skips opening a session when the GitHub snapshot fails", async () => {
    const user = await makeUser();
    const res = await handleHeartbeat(user.id, CORGI, { fetchCount: failing });
    expect(res.present).toBe(false);
    expect(await db.session.count()).toBe(0);
  });
});

describe("sweepStaleSessions", () => {
  it("closes sessions silent past the timeout and leaves fresh ones", async () => {
    const stale = await makeUser();
    const fresh = await makeUser();
    const t0 = new Date("2026-07-09T12:00:00Z");
    await handleHeartbeat(stale.id, CORGI, { fetchCount: countOf(10), now: t0 });
    const t1 = new Date("2026-07-09T12:04:00Z");
    await handleHeartbeat(fresh.id, CORGI, { fetchCount: countOf(20), now: t1 });

    // 5-minute timeout: at 12:06, stale (last seen 12:00) is out; fresh is not.
    const closed = await sweepStaleSessions({
      now: new Date("2026-07-09T12:06:00Z"),
      fetchCount: countOf(13),
    });
    expect(closed).toBe(1);

    const staleSession = await db.session.findFirstOrThrow({ where: { userId: stale.id } });
    expect(staleSession.status).toBe("closed");
    expect(staleSession.commits).toBe(3);
    const freshSession = await db.session.findFirstOrThrow({ where: { userId: fresh.id } });
    expect(freshSession.status).toBe("open");
  });
});

describe("pollOpenSessions", () => {
  it("updates the live counter and delta for open sessions", async () => {
    const user = await makeUser();
    await handleHeartbeat(user.id, CORGI, { fetchCount: countOf(50) });
    await pollOpenSessions({ fetchCount: countOf(58) });

    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.currentCount).toBe(58);
    expect(session.commits).toBe(8);
    expect(session.status).toBe("open");
  });

  it("skips a failing poll without corrupting state", async () => {
    const user = await makeUser();
    await handleHeartbeat(user.id, CORGI, { fetchCount: countOf(50) });
    await pollOpenSessions({ fetchCount: failing });

    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.currentCount).toBe(50);
    expect(session.commits).toBe(0);
  });
});
