/**
 * Payment service against the mock provider and the real database: invoice
 * idempotency, verification, duplicate protection and callback authentication.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, createUser, owner } from "./helpers/db";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));

const { createInvoiceForOrder, verifyPayment, verifyCallbackToken, callbackToken, reconcileOpenPayments } = await import("@/lib/payments/service");
const { mockMarkPaid } = await import("@/lib/payments/mock-provider");
const { sql } = await import("@/lib/db");

let client: { id: string; email: string };
let other: { id: string; email: string };
let orderId: string;

beforeAll(async () => {
  client = { id: await createUser("pay@test.mn", "Payer"), email: "pay@test.mn" };
  other = { id: await createUser("other@test.mn", "Other"), email: "other@test.mn" };
  await owner`update service_prices set status = 'approved' where status = 'proposed' and pricing_model = 'fixed'`;
  const r = await as(client.id, (tx) => tx`select (app.create_order_draft('M_CHECK',
    ${tx.json({ property_type: "office", address: "Сүхбаатар дүүрэг, 1-р хороо", asking_price_mnt: "750000000" })},
    ${tx.json([{ party_role: "buyer", full_name: "Payer", is_client: true }])}, null)).id`);
  orderId = r[0].id as string;
  await as(client.id, (tx) => tx`select app.submit_order(${orderId}::uuid, true)`);
});

afterAll(async () => {
  await sql().end();
  await owner.end();
});

describe("invoice creation", () => {
  it("uses the frozen order amount (office, ₮500M–1B band)", async () => {
    const o = await owner`select amount_mnt from orders where id = ${orderId}`;
    expect(o[0].amount_mnt).toBe(350000);
  });

  it("refuses an order the user does not own", async () => {
    await expect(createInvoiceForOrder(other, orderId)).rejects.toMatchObject({ code: "order_not_found" });
  });

  it("is idempotent: repeated requests return the same open invoice", async () => {
    const [a, b] = await Promise.all([createInvoiceForOrder(client, orderId), createInvoiceForOrder(client, orderId)]);
    const c = await createInvoiceForOrder(client, orderId);
    expect(new Set([a.id, b.id, c.id]).size).toBe(1);
    expect(a.amountMnt).toBe(350000);
    const n = await owner`select count(*)::int as n from payments where order_id = ${orderId} and status = 'pending'`;
    expect(n[0].n).toBe(1);
  });
});

describe("verification", () => {
  it("an unpaid invoice stays pending and the order is untouched", async () => {
    const p = (await owner`select id from payments where order_id = ${orderId}`)[0];
    const v = await verifyPayment(p.id as string, "poll");
    expect(v.status).toBe("pending");
    const o = await owner`select status from orders where id = ${orderId}`;
    expect(o[0].status).toBe("awaiting_payment");
  });

  it("a provider-confirmed payment marks the order paid; replays are harmless", async () => {
    const p = (await owner`select id, provider_invoice_id from payments where order_id = ${orderId}`)[0];
    expect(mockMarkPaid(p.provider_invoice_id as string)).toBe(true);
    const results = await Promise.all([verifyPayment(p.id as string, "callback"), verifyPayment(p.id as string, "callback"), verifyPayment(p.id as string, "poll")]);
    expect(results.every((r) => r.status === "paid")).toBe(true);
    const o = await owner`select status from orders where id = ${orderId}`;
    expect(o[0].status).toBe("paid");
    const h = await owner`select count(*)::int as n from order_status_history where order_id = ${orderId} and to_status = 'paid'`;
    expect(h[0].n).toBe(1);
    const ev = await owner`select count(*)::int as n from payment_events where payment_id = ${p.id} and event_type like 'payment.paid%'`;
    expect(ev[0].n).toBe(1);
  });

  it("no second invoice can be created for a paid order", async () => {
    await expect(createInvoiceForOrder(client, orderId)).rejects.toMatchObject({ code: "order_not_payable" });
  });

  it("an amount mismatch is recorded and never confirms the order", async () => {
    const r = await as(client.id, (tx) => tx`select (app.create_order_draft('M_CHECK',
      ${tx.json({ property_type: "apartment", address: "Баянгол дүүрэг, 3-р хороо", asking_price_mnt: "100000000" })},
      ${tx.json([{ party_role: "buyer", full_name: "Payer", is_client: true }])}, null)).id`);
    const id = r[0].id as string;
    await as(client.id, (tx) => tx`select app.submit_order(${id}::uuid, true)`);
    const inv = await createInvoiceForOrder(client, id);
    const p = (await owner`select provider_invoice_id from payments where id = ${inv.id}`)[0];
    mockMarkPaid(p.provider_invoice_id as string, 1000); // payer paid the wrong amount
    await expect(verifyPayment(inv.id, "callback")).rejects.toMatchObject({ code: "amount_mismatch" });
    const o = await owner`select status from orders where id = ${id}`;
    expect(o[0].status).toBe("awaiting_payment");
    const pay = await owner`select status, failure_reason from payments where id = ${inv.id}`;
    expect(pay[0]).toMatchObject({ status: "pending", failure_reason: "amount_mismatch" });
    const audit = await owner`select count(*)::int as n from audit_logs where action = 'payment.amount_mismatch' and entity_id = ${inv.id}`;
    expect(audit[0].n).toBe(1);
  });

  it("reconciliation re-checks every open invoice", async () => {
    const res = await reconcileOpenPayments();
    expect(Object.values(res).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});

describe("callback authentication", () => {
  it("accepts only our HMAC token for that payment", () => {
    const id = "6f1c1f9e-6b8a-4a8e-9d1e-2b1a3c4d5e6f";
    expect(verifyCallbackToken(id, callbackToken(id))).toBe(true);
    expect(verifyCallbackToken(id, null)).toBe(false);
    expect(verifyCallbackToken(id, "forged")).toBe(false);
    expect(verifyCallbackToken("00000000-0000-0000-0000-000000000000", callbackToken(id))).toBe(false);
  });
});
