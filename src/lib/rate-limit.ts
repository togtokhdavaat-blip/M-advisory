import "server-only";

/**
 * Fixed-window limiter keyed by (bucket, identifier). In-memory, so it limits
 * per server instance — adequate for a single Vercel region at launch.
 * Swap for a shared store (Upstash Redis / Postgres) before scaling out.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(bucket: string, id: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const key = `${bucket}:${id}`;
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 50_000) {
      for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    }
    return { ok: true, retryAfterMs: 0 };
  }
  w.count += 1;
  return w.count <= limit ? { ok: true, retryAfterMs: 0 } : { ok: false, retryAfterMs: w.resetAt - now };
}
