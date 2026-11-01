import { NextResponse, type NextRequest } from "next/server";
import { PaymentError, verifyCallbackToken, verifyPayment } from "@/lib/payments/service";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Provider callback (QPay calls GET/POST on the callback_url we supplied).
 * The callback itself is never trusted: we authenticate the URL with our own
 * HMAC token, then ask the provider server-to-server whether the invoice is
 * paid. Re-delivery is harmless (verifyPayment is idempotent).
 */
async function handle(req: NextRequest) {
  const paymentId = req.nextUrl.searchParams.get("payment_id") ?? "";
  const token = req.nextUrl.searchParams.get("t");
  if (!/^[0-9a-f-]{36}$/i.test(paymentId) || !verifyCallbackToken(paymentId, token)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit("payment-callback", ip, 120, 60_000).ok) return NextResponse.json({ ok: false }, { status: 429 });
  try {
    const v = await verifyPayment(paymentId, "callback");
    return NextResponse.json({ ok: true, status: v.status });
  } catch (e) {
    const code = e instanceof PaymentError ? e.code : "error";
    // 200 for business outcomes so the provider stops retrying; 500 lets it retry transient failures.
    return NextResponse.json({ ok: false, error: code }, { status: code === "error" ? 500 : 200 });
  }
}

export const GET = handle;
export const POST = handle;
