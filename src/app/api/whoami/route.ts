import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { resolveClientIp, isCorgiIp } from "@/lib/ip";

export const dynamic = "force-dynamic";

/**
 * What the presence check sees for this request. Visit from the cafe wifi to
 * find the IP to put in CORGI_IPS, and to verify the proxy config
 * (TRUSTED_IP_HEADER / TRUSTED_PROXY_HOPS) is right for the hosting setup.
 */
export async function GET(req: NextRequest) {
  const ip = resolveClientIp(req.headers);
  return NextResponse.json({
    ip,
    inCafe: isCorgiIp(ip, config.corgiIps),
    trustedIpHeader: config.trustedIpHeader,
    trustedProxyHops: config.trustedProxyHops,
    headers: {
      "x-forwarded-for": req.headers.get("x-forwarded-for"),
      "true-client-ip": req.headers.get("true-client-ip"),
      "cf-connecting-ip": req.headers.get("cf-connecting-ip"),
    },
  });
}
