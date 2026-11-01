import "server-only";
import { env } from "../env";
import type { PaymentProvider } from "./types";

/**
 * QPay merchant API v2 adapter.
 *
 * STATUS: written against QPay's public v2 merchant API (auth/token, invoice,
 * payment/check). It has NOT been exercised against QPay yet — no merchant
 * credentials exist. Before go-live: run it against merchant-sandbox.qpay.mn
 * with M Properties' sandbox credentials and confirm field names against the
 * documentation QPay issues with the merchant contract.
 *
 * QPay's callback carries no signature, so the callback handler never trusts
 * it: it only triggers checkInvoice(), which asks QPay server-to-server.
 */
let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expiresAt - 60_000 > Date.now()) return token.value;
  const e = env();
  const res = await fetch(`${e.QPAY_BASE_URL}/v2/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${e.QPAY_USERNAME}:${e.QPAY_PASSWORD}`).toString("base64")}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`qpay_auth_failed_${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  // expires_in is a unix timestamp (seconds) in QPay v2 responses.
  const exp = body.expires_in > 1e9 ? body.expires_in * 1000 : Date.now() + body.expires_in * 1000;
  token = { value: body.access_token, expiresAt: exp };
  return token.value;
}

async function qpay<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${env().QPAY_BASE_URL}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`qpay_${path.replace(/\W+/g, "_")}_failed_${res.status}`);
  return (await res.json()) as T;
}

export const qpayProvider: PaymentProvider = {
  name: "qpay",
  async createInvoice(input) {
    const body = await qpay<{
      invoice_id: string;
      qr_text: string;
      qr_image: string;
      qPay_shortUrl?: string;
      urls?: { name: string; description?: string; logo?: string; link: string }[];
    }>("/v2/invoice", {
      method: "POST",
      body: {
        invoice_code: env().QPAY_INVOICE_CODE,
        sender_invoice_no: input.paymentId,
        invoice_receiver_code: input.orderNumber,
        invoice_description: input.description.slice(0, 255),
        amount: input.amountMnt,
        callback_url: input.callbackUrl,
      },
    });
    return {
      providerInvoiceId: body.invoice_id,
      payload: { qrText: body.qr_text, qrImage: body.qr_image, shortUrl: body.qPay_shortUrl, urls: body.urls ?? [] },
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    };
  },
  async checkInvoice(invoiceId) {
    const body = await qpay<{
      count: number;
      paid_amount?: number;
      rows: { payment_id: string; payment_status: string; payment_amount: string | number }[];
    }>("/v2/payment/check", {
      method: "POST",
      body: { object_type: "INVOICE", object_id: invoiceId, offset: { page_number: 1, page_limit: 100 } },
    });
    const paid = body.rows?.find((r) => r.payment_status === "PAID");
    if (paid) {
      return { status: "paid", providerPaymentId: paid.payment_id, paidAmountMnt: Math.round(Number(paid.payment_amount)), raw: body };
    }
    const failed = body.rows?.length && body.rows.every((r) => r.payment_status === "FAILED");
    return { status: failed ? "failed" : "pending", raw: body };
  },
  async cancelInvoice(invoiceId) {
    await qpay(`/v2/invoice/${encodeURIComponent(invoiceId)}`, { method: "DELETE" });
  },
};
