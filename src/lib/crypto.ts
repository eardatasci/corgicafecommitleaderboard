import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { config } from "./config";

// GitHub access tokens are encrypted at rest with AES-256-GCM.
// Format: base64url(iv).base64url(ciphertext).base64url(authTag)

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config.tokenEncKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, ct, cipher.getAuthTag()]
    .map((b) => b.toString("base64url"))
    .join(".");
}

export function decryptToken(encrypted: string): string {
  const [iv, ct, tag] = encrypted
    .split(".")
    .map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", config.tokenEncKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// Session cookie: base64url(JSON payload).hex(HMAC-SHA256). The HMAC key is
// derived from TOKEN_ENC_KEY so a single secret configures the app.

function sessionKey(): Buffer {
  return Buffer.from(
    hkdfSync("sha256", config.tokenEncKey, Buffer.alloc(0), "cccl-session", 32),
  );
}

export function signSession(userId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, iat: Date.now() }),
  ).toString("base64url");
  const sig = createHmac("sha256", sessionKey()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySession(token: string | undefined | null): number | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", sessionKey()).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof parsed.uid === "number" ? parsed.uid : null;
  } catch {
    return null;
  }
}
