// Demo seed for local dev only: a few users and open sessions so the board
// renders with content. Run: node prisma/seed-demo.mjs
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const users = [
  { githubId: 900001, username: "mochi-ships", totalCommits: 128 },
  { githubId: 900002, username: "ein-the-data-dog", totalCommits: 87 },
  { githubId: 900003, username: "stubby-stack", totalCommits: 55 },
  { githubId: 900004, username: "loaf-of-code", totalCommits: 31 },
  { githubId: 900005, username: "sploot-eng", totalCommits: 9 },
];

for (const u of users) {
  await db.user.upsert({
    where: { githubId: u.githubId },
    create: {
      ...u,
      avatarUrl: `https://avatars.githubusercontent.com/u/${u.githubId}?v=4`,
      encAccessToken: "demo.demo.demo",
    },
    update: { totalCommits: u.totalCommits },
  });
}

// Two of them are in the cafe right now
const mochi = await db.user.findUniqueOrThrow({ where: { githubId: 900001 } });
const sploot = await db.user.findUniqueOrThrow({ where: { githubId: 900005 } });
await db.session.deleteMany({});
await db.session.create({
  data: {
    userId: mochi.id,
    startedAt: new Date(Date.now() - 95 * 60_000),
    startCount: 400,
    currentCount: 407,
    commits: 7,
    lastIp: "203.0.113.7",
  },
});
await db.session.create({
  data: {
    userId: sploot.id,
    startedAt: new Date(Date.now() - 12 * 60_000),
    startCount: 50,
    currentCount: 50,
    commits: 0,
    lastIp: "203.0.113.7",
  },
});

console.log("seeded");
await db.$disconnect();
