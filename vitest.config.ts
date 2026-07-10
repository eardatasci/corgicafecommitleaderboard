import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: "./src/test/global-setup.ts",
    env: {
      DATABASE_URL: "file:./test.db",
      TOKEN_ENC_KEY:
        "0000000000000000000000000000000000000000000000000000000000000000",
      CORGI_IPS: "203.0.113.7,203.0.113.8",
      TRUSTED_PROXY_HOPS: "1",
    },
    // The presence tests share one SQLite file; keep them in a single worker.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
