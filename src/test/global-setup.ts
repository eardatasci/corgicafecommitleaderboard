import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const TEST_DB = path.resolve(__dirname, "../../prisma/test.db");

export default function setup() {
  // Fresh SQLite database for every test run, created from the Prisma schema.
  for (const f of [TEST_DB, `${TEST_DB}-journal`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "ignore",
  });
  process.env.DATABASE_URL = "file:./test.db";
}
