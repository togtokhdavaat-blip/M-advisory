import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "../auth";
import { asSystem, asUser, type Tx } from "../db";
import { env, sessionSecret } from "../env";
import { getPaymentProvider } from "./index";
import type { CreatedInvoice } from "./types";

export class PaymentError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export interface PaymentView {
  id: string;
  status: string;
  amountMnt: number;
  provider: string;
  payload: CreatedInvoice["payload"] | null;
  expiresAt: string | null;
  paidAt: string | null;
}

function toView(r: Record<string, unknown>): PaymentView {
  return {
    id: r.id as string,
    status: r.status as string,
    amountMnt: r.amount_mnt as number,
    provider: r.provider as string,
    payload: (r.invoice_payload as PaymentView["payload"]) ?? null,
    expiresAt: r.expires_at ? new Date(r.expires_at as string).toISOString() : null,
    paidAt: r.paid_at ? new Date(r.paid_at as string).toISOString() : null,
  };
}

/** Our own HMAC in the callback URL, because QPay callbacks are unsigned. */
export function callbackToken(paymentId: string): string {
  const secret = env().QPAY_CALLBACK_SECRET ?? Buffer.from(sessionSecret()).toString();
  return createHmac("sha256", secret).update(`payment:${paymentId}`).digest("base64url");
}

export function verifyCallbackToken(paymentId: string, token: string | null): boolean {
  if (!token) return false;
  const a = Buffer.from(callbackToken(paymentId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Create (or return the still-valid open) invoice for an order the user owns.
 * Duplicate protection: the DB allows one pending and one paid payment per order.
 */
export async function createInvoiceForOrder(user: SessionUser, orderId: string): Promise<PaymentView> {
  // 1. Authorisation and amount come from the database under the user's RLS.
  const order = await asUser(user, async (tx) => {
    const rows = await tx`
      select id, order_number, status, amount_mnt, client_id
      from orders where id = ${orderId}`;
    return rows[0];
  });
  if (!order || order.client_id !== user.id) throw new PaymentError("order_not_found");
  if (order.status !== "awaiting_payment") throw new PaymentError("order_not_payable");
  if (!order.amount_mnt || (order.amount_mnt as number) <= 0) throw new PaymentError("amount_missing");

  const provider = getPaymentProvider();

  // 2. Reuse an open invoice; expire stale ones.
  const existing = await asSystem(async (tx) => {
    await tx`update payments set status = 'expired', failure_reason = 'expired'
             where order_id = ${orderId} and status = 'pending' and expires_at < now()`;
    const rows = await tx`select * from payments where order_id = ${orderId} and status in ('pending', 'paid') order by created_at desc limit 1`;
    return rows[0];
  });
  if (existing) {
    if (existing.status === "paid") throw new PaymentError("already_paid");
    if (existing.provider === provider.name && existing.provider_invoice_id) return toView(existing);
  }

  // 3. Reserve the payment row first (unique index blocks a concurrent duplicate).
  const attempt = await asSystem(async (tx) => {
    const n = await tx`select count(*)::int as n from payments where order_id = ${orderId}`;
    const key = `order:${orderId}:attempt:${(n[0].n as number) + 1}`;
    const rows = await tx`
      insert into payments (order_id, amount_mnt, provider, idempotency_key, created_by)
      values (${orderId}, ${order.amount_mnt as number}, ${provider.name}, ${key}, ${user.id})
      on conflict do nothing
      returning *`;
    return rows[0];
  }).catch((e: { code?: string }) => {
    if (e.code === "23505") return null; // a concurrent request won the race
    throw e;
  });
  if (!attempt) {
    const again = await asSystem((tx) => tx`select * from payments where order_id = ${orderId} and status = 'pending' limit 1`);
    if (again[0]) return toView(again[0]);
    throw new PaymentError("payment_conflict");
  }

  // 4. Ask the provider for an invoice.
  try {
    const callbackUrl = `${env().APP_URL}/api/payments/callback?payment_id=${attempt.id}&t=${callbackToken(attempt.id as string)}`;
    const invoice = await provider.createInvoice({
      paymentId: attempt.id as string,
      orderNumber: order.order_number as string,
      amountMnt: order.amount_mnt as number,
      description: `M ADVISORY ${order.order_number}`,
      callbackUrl,
    });
    const rows = await asSystem(async (tx) => {
      await logEvent(tx, attempt.id as string, provider.name, `invoice:${invoice.providerInvoiceId}`, "invoice.created", {
        provider_invoice_id: invoice.providerInvoiceId,
      }, true);
      return tx`
        update payments set provider_invoice_id = ${invoice.providerInvoiceId},
          invoice_payload = ${tx.json(invoice.payload as never)}, expires_at = ${invoice.expiresAt}
        where id = ${attempt.id} returning *`;
    });
    await asSystem((tx) => tx`select app.audit('payment.invoice_created', 'payment', ${attempt.id}::uuid, ${tx.json({ order: orderId })})`);
    return toView(rows[0]);
  } catch (e) {
    await asSystem((tx) => tx`update payments set status = 'failed', failure_reason = ${String((e as Error).message).slice(0, 200)} where id = ${attempt.id}`);
    throw new PaymentError("provider_unavailable");
  }
}

async function logEvent(tx: Tx, paymentId: string | null, provider: string, eventId: string, type: string, payload: unknown, verified: boolean) {
  const rows = await tx`
    insert into payment_events (payment_id, provider, provider_event_id, event_type, payload, verified, processed_at)
    values (${paymentId}, ${provider}, ${eventId}, ${type}, ${tx.json(payload as never)}, ${verified}, now())
    on conflict (provider, provider_event_id) do nothing
    returning id`;
  return rows.length > 0;
}

/**
 * Ask the provider whether the invoice is paid and, if so, confirm it.
 * Safe to call any number of times (webhook retries, polling, reconciliation).
 */
export async function verifyPayment(paymentId: string, source: "callback" | "poll" | "reconcile"): Promise<PaymentView> {
  const payment = (await asSystem((tx) => tx`select * from payments where id = ${paymentId}`))[0];
  if (!payment) throw new PaymentError("payment_not_found");
  if (payment.status !== "pending" || !payment.provider_invoice_id) return toView(payment);

  const provider = getPaymentProvider();
  if (provider.name !== payment.provider) throw new PaymentError("provider_mismatch");
  const check = await provider.checkInvoice(payment.provider_invoice_id as string);

  let mismatch = false;
  const view = await asSystem(async (tx) => {
    if (check.status === "paid") {
      const eventId = `paid:${payment.provider_invoice_id}:${check.providerPaymentId ?? "unknown"}`;
      await logEvent(tx, paymentId, provider.name, eventId, `payment.paid.${source}`, check.raw, true);
      if (check.paidAmountMnt !== undefined && check.paidAmountMnt !== payment.amount_mnt) {
        await tx`update payments set failure_reason = 'amount_mismatch' where id = ${paymentId}`;
        await tx`select app.audit('payment.amount_mismatch', 'payment', ${paymentId}::uuid,
                 ${tx.json({ expected: payment.amount_mnt as number, received: check.paidAmountMnt })})`;
        mismatch = true; // recorded and committed; a human must resolve it
      } else {
        await tx`select app.confirm_payment(${paymentId}::uuid, ${check.providerPaymentId ?? null})`;
      }
    } else if (check.status === "expired" || check.status === "failed") {
      await logEvent(tx, paymentId, provider.name, `${check.status}:${payment.provider_invoice_id}`, `payment.${check.status}`, check.raw, true);
      await tx`update payments set status = ${check.status}, failure_reason = ${check.status} where id = ${paymentId} and status = 'pending'`;
    }
    const rows = await tx`select * from payments where id = ${paymentId}`;
    return toView(rows[0]);
  });
  if (mismatch) throw new PaymentError("amount_mismatch");
  return view;
}

/** Reconciliation job: re-check every open invoice. Returns counts by result. */
export async function reconcileOpenPayments(): Promise<Record<string, number>> {
  const open = await asSystem((tx) => tx`select id from payments where status = 'pending' and provider_invoice_id is not null`);
  const result: Record<string, number> = {};
  for (const p of open) {
    try {
      const v = await verifyPayment(p.id as string, "reconcile");
      result[v.status] = (result[v.status] ?? 0) + 1;
    } catch (e) {
      const code = e instanceof PaymentError ? e.code : "error";
      result[code] = (result[code] ?? 0) + 1;
    }
  }
  return result;
}
