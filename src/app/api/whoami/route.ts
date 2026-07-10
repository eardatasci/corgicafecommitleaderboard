import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { clientIpFromXff, isCorgiIp } from "@/lib/ip";

export const dynamic = "force-dynamic";

/**
 * What the presence check sees for this request. Visit from the cafe wifi to
 * find the IP to put in CORGI_IPS, and to verify TRUSTED_PROXY_HOPS is right
 * for the hosting setup (e.g. Cloudflare in front of Render = 2 hops).
 */
export async function GET(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for");
  const ip = config.devFakeIp ?? clientIpFromXff(xff, config.trustedProxyHops);
  return NextResponse.json({
    ip,
    inCafe: isCorgiIp(ip, config.corgiIps),
    trustedProxyHops: config.trustedProxyHops,
    headers: {
      "x-forwarded-for": xff,
      "true-client-ip": req.headers.get("true-client-ip"),
      "cf-connecting-ip": req.headers.get("cf-connecting-ip"),
    },
  });
}
