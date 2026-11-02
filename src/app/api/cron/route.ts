import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { asSystem } from "@/lib/db";
import { purgeExpiredDocuments } from "@/lib/documents/service";
import { dispatchEmails } from "@/lib/notify/email";
import { reconcileOpenPayments } from "@/lib/payments/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled maintenance (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`):
 * payment reconciliation, e-mail outbox, invoice expiry, document retention.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result: Record<string, unknown> = {};
  const run = async (name: string, fn: () => Promise<unknown>) => {
    try {
      result[name] = await fn();
    } catch (e) {
      result[name] = { error: String((e as Error).message).slice(0, 200) };
    }
  };
  await run("payments", reconcileOpenPayments);
  await run("expired_invoices", async () =>
    (await asSystem((tx) => tx`update payments set status = 'expired', failure_reason = 'expired' where status = 'pending' and expires_at < now() returning id`)).length);
  await run("emails", () => dispatchEmails(200));
  await run("documents_purged", purgeExpiredDocuments);
  await asSystem((tx) => tx`insert into audit_logs (action, entity_type, metadata) values ('cron.run', 'system', ${tx.json(result as never)})`);
  return NextResponse.json({ ok: true, ...result });
}
