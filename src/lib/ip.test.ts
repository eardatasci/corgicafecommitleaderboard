import { describe, it, expect } from "vitest";
import { clientIpFromXff, isCorgiIp } from "./ip";

describe("clientIpFromXff", () => {
  it("takes the last entry with one trusted hop", () => {
    expect(clientIpFromXff("203.0.113.7", 1)).toBe("203.0.113.7");
  });

  it("ignores client-injected entries to the left", () => {
    // Client sent "X-Forwarded-For: 203.0.113.7" (a Corgi IP) trying to spoof;
    // the trusted proxy appended the real address 198.51.100.9.
    expect(clientIpFromXff("203.0.113.7, 198.51.100.9", 1)).toBe("198.51.100.9");
  });

  it("counts back through multiple trusted hops", () => {
    expect(clientIpFromXff("evil, 203.0.113.7, 10.0.0.2", 2)).toBe("203.0.113.7");
  });

  it("returns null when the header is missing or malformed", () => {
    expect(clientIpFromXff(null, 1)).toBeNull();
    expect(clientIpFromXff("", 1)).toBeNull();
    expect(clientIpFromXff("1.2.3.4", 2)).toBeNull(); // fewer entries than hops
  });

  it("trims whitespace and strips IPv6-mapped prefix", () => {
    expect(clientIpFromXff("  ::ffff:203.0.113.7  ", 1)).toBe("203.0.113.7");
  });
});

describe("isCorgiIp", () => {
  const corgi = ["203.0.113.7", "203.0.113.8"];
  it("matches an allowlisted IP", () => {
    expect(isCorgiIp("203.0.113.7", corgi)).toBe(true);
    expect(isCorgiIp("203.0.113.8", corgi)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isCorgiIp("198.51.100.9", corgi)).toBe(false);
    expect(isCorgiIp(null, corgi)).toBe(false);
    expect(isCorgiIp("", corgi)).toBe(false);
  });
});
