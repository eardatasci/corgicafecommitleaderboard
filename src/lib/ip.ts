import { config } from "./config";

/**
 * Real client IP from X-Forwarded-For, trusting exactly `trustedHops`
 * rightmost entries (the ones appended by proxies we control). Anything the
 * client injected sits further left and is never read, so a client cannot
 * spoof a Corgi IP.
 */
export function clientIpFromXff(
  xff: string | null,
  trustedHops: number,
): string | null {
  if (!xff || trustedHops < 1) return null;
  const parts = xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < trustedHops) return null;
  return normalizeIp(parts[parts.length - trustedHops]);
}

export function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}

export function isCorgiIp(ip: string | null, corgiIps: string[]): boolean {
  if (!ip) return false;
  return corgiIps.includes(normalizeIp(ip));
}

/**
 * The client IP the presence check trusts for a request:
 * DEV_FAKE_IP (local dev) → TRUSTED_IP_HEADER (a header the edge proxy
 * overwrites, e.g. true-client-ip on Render) → X-Forwarded-For hop counting.
 */
export function resolveClientIp(headers: Headers): string | null {
  if (config.devFakeIp) return config.devFakeIp;
  if (config.trustedIpHeader) {
    const value = headers.get(config.trustedIpHeader);
    return value ? normalizeIp(value.trim()) : null;
  }
  return clientIpFromXff(headers.get("x-forwarded-for"), config.trustedProxyHops);
}
