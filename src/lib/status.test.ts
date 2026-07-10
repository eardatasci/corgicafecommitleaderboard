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
