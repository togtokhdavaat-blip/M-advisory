import "server-only";
import { env, isProduction } from "../env";
import { mockPaymentProvider } from "./mock-provider";
import { qpayProvider } from "./qpay-provider";
import type { PaymentProvider } from "./types";

export function getPaymentProvider(): PaymentProvider {
  const e = env();
  if (e.PAYMENT_PROVIDER === "qpay") return qpayProvider;
  if (isProduction()) throw new Error("mock payment provider is disabled in production");
  return mockPaymentProvider;
}
