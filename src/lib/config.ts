function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  get githubClientId() {
    return process.env.GITHUB_CLIENT_ID ?? "";
  },
  get githubClientSecret() {
    return process.env.GITHUB_CLIENT_SECRET ?? "";
  },
  /** 32-byte hex key for AES-256-GCM token encryption at rest. */
  get tokenEncKey() {
    const key = process.env.TOKEN_ENC_KEY ?? "";
    if (!/^[0-9a-fA-F]{64}$/.test(key)) {
      throw new Error("TOKEN_ENC_KEY must be 64 hex chars (32 bytes). Generate one: openssl rand -hex 32");
    }
    return Buffer.from(key, "hex");
  },
  /** Allowlist of the cafe router's public IP(s). */
  get corgiIps(): string[] {
    return (process.env.CORGI_IPS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
  /**
   * How many rightmost X-Forwarded-For entries were appended by proxies we
   * control. 0 = no proxy (local dev): presence checks trust nothing and
   * DEV_FAKE_IP can simulate the cafe network.
   */
  get trustedProxyHops() {
    return int("TRUSTED_PROXY_HOPS", 1);
  },
  /**
   * A single header the edge proxy overwrites with the real client IP
   * (verified unspoofable), e.g. "true-client-ip" on Render/Cloudflare.
   * When set, it wins over X-Forwarded-For hop counting.
   */
  get trustedIpHeader() {
    const h = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();
    return h || null;
  },
  get devFakeIp() {
    return process.env.DEV_FAKE_IP ?? null;
  },
  /** Minutes of heartbeat silence before the sweep marks a user OUT. */
  get heartbeatTimeoutMin() {
    return int("HEARTBEAT_TIMEOUT_MIN", 5);
  },
  /**
   * Seconds between in-session contribution re-queries (floor 15s). Each
   * query costs ~1 of a user's 5000/hr GraphQL points, so short is cheap;
   * the poll loop backs off automatically if a token's budget runs low.
   */
  get sessionPollSec() {
    return Math.max(5, int("SESSION_POLL_SEC", 15));
  },
  get baseUrl() {
    return process.env.BASE_URL ?? "http://localhost:3000";
  },
};
