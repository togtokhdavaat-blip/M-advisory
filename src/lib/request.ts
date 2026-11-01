import "server-only";
import { headers } from "next/headers";

export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || h.get("x-real-ip") || "0.0.0.0";
}

export async function userAgent(): Promise<string> {
  return ((await headers()).get("user-agent") ?? "").slice(0, 500);
}

export function isIp(v: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(v) || /^[0-9a-f:]+$/i.test(v);
}
