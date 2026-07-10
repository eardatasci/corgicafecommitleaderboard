import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken, signSession, verifySession } from "./crypto";

describe("token encryption (AES-256-GCM)", () => {
  it("round-trips a token", () => {
    const enc = encryptToken("gho_secret123");
    expect(enc).not.toContain("gho_secret123");
    expect(decryptToken(enc)).toBe("gho_secret123");
  });

  it("produces a different ciphertext each call (random IV)", () => {
    expect(encryptToken("same")).not.toBe(encryptToken("same"));
  });

  it("rejects tampered ciphertext", () => {
    const enc = encryptToken("gho_secret123");
    const parts = enc.split(".");
    // flip a character in the ciphertext part
    parts[1] = parts[1].slice(0, -2) + (parts[1].endsWith("A") ? "BB" : "AA");
    expect(() => decryptToken(parts.join("."))).toThrow();
  });
});

describe("session cookie signing", () => {
  it("round-trips a user id", () => {
    const token = signSession(42);
    expect(verifySession(token)).toBe(42);
  });

  it("rejects a tampered payload", () => {
    const token = signSession(42);
    const [payload, sig] = token.split(".");
    const forged =
      Buffer.from(JSON.stringify({ uid: 1, iat: Date.now() }))
        .toString("base64url") + "." + sig;
    expect(verifySession(forged)).toBeNull();
    expect(verifySession(payload + ".deadbeef")).toBeNull();
    expect(verifySession("garbage")).toBeNull();
    expect(verifySession("")).toBeNull();
  });
});
