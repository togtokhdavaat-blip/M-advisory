import "server-only";
import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "./types";

/**
 * DEVELOPMENT / TEST ONLY. Keeps invoice state in process memory. env()
 * refuses PAYMENT_PROVIDER=mock in production, and getPaymentProvider()
 * double-checks, so this can never mark a real order as paid.
 */
type MockInvoice = { id: string; amountMnt: number; status: "pending" | "paid" | "failed"; paymentRef?: string; expiresAt: Date };
const g = globalThis as unknown as { __mockInvoices?: Map<string, MockInvoice> };
const store = (g.__mockInvoices ??= new Map());

export const mockPaymentProvider: PaymentProvider = {
  name: "mock",
  async createInvoice(input) {
    const id = `MOCK-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    store.set(id, { id, amountMnt: input.amountMnt, status: "pending", expiresAt });
    return {
      providerInvoiceId: id,
      payload: { qrText: `MOCK|${input.orderNumber}|${input.amountMnt}`, shortUrl: undefined, urls: [] },
      expiresAt,
    };
  },
  async checkInvoice(id) {
    const inv = store.get(id);
    if (!inv) return { status: "failed", raw: { error: "unknown_invoice" } };
    if (inv.status === "pending" && inv.expiresAt < new Date()) return { status: "expired", raw: inv };
    return { status: inv.status, providerPaymentId: inv.paymentRef, paidAmountMnt: inv.status === "paid" ? inv.amountMnt : undefined, raw: inv };
  },
  async cancelInvoice(id) {
    store.delete(id);
  },
};

/** Test/dev helper: simulate the payer completing payment in their bank app. */
export function mockMarkPaid(providerInvoiceId: string, amountMnt?: number): boolean {
  const inv = store.get(providerInvoiceId);
  if (!inv || inv.status !== "pending") return false;
  inv.status = "paid";
  inv.paymentRef = `MOCKPAY-${randomUUID()}`;
  if (amountMnt !== undefined) inv.amountMnt = amountMnt;
  return true;
}
