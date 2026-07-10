import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { subscribe, notifyBoardChanged } from "./live";
import { handleHeartbeat } from "./presence";

const CORGI = "203.0.113.7";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe("live board broadcasts", () => {
  it("pushes one deduplicated payload per change to all subscribers", async () => {
    const user = await db.user.create({
      data: {
        githubId: 7000,
        username: "livewire",
        avatarUrl: "https://example.com/a.png",
        encAccessToken: "x.x.x",
        totalCommits: 5,
      },
    });

    const received: string[][] = [[], []];
    const unsubs = [
      subscribe((p) => received[0].push(p)),
      subscribe((p) => received[1].push(p)),
    ];

    // burst of notifications → debounced to a single broadcast
    notifyBoardChanged();
    notifyBoardChanged();
    await sleep(300);
    expect(received[0]).toHaveLength(1);
    expect(received[1]).toHaveLength(1);
    expect(received[0][0]).toContain("livewire");

    // board unchanged → no re-broadcast
    notifyBoardChanged();
    await sleep(300);
    expect(received[0]).toHaveLength(1);

    // real change (session opens) → broadcast with the live entry
    await handleHeartbeat(user.id, CORGI, { fetchCount: async () => 10 });
    await sleep(300);
    expect(received[0]).toHaveLength(2);
    expect(JSON.parse(received[0][1]).hereNow[0].username).toBe("livewire");

    unsubs.forEach((u) => u());
  });
});
