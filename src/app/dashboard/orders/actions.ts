"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { asSystem, asUser, dbErrorCode } from "@/lib/db";
import { createInvoiceForOrder, PaymentError, verifyPayment } from "@/lib/payments/service";
import { mockMarkPaid } from "@/lib/payments/mock-provider";
import { env, isProduction } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, isIp, userAgent } from "@/lib/request";

const MESSAGES: Record<string, string> = {
  terms_not_accepted: "Үйлчилгээний нөхцөлийг зөвшөөрнө үү.",
  price_not_configured: "Энэ төрлийн хөрөнгийн үнэ батлагдаагүй байна. Бид тантай холбогдож үнийн санал өгнө.",
  price_requires_quote: "Энэ захиалгад тусгай үнийн санал шаардлагатай.",
  order_not_editable: "Захиалга засах боломжгүй төлөвт байна.",
  order_not_found: "Захиалга олдсонгүй.",
  transition_not_allowed: "Энэ үйлдлийг хийх боломжгүй.",
  open_payment_exists: "Нээлттэй нэхэмжлэл байгаа тул буцааж засах боломжгүй.",
  order_not_payable: "Захиалга төлбөр хүлээж буй төлөвт биш байна.",
  already_paid: "Төлбөр аль хэдийн төлөгдсөн.",
  provider_unavailable: "Төлбөрийн систем түр ажиллахгүй байна. Түр хүлээгээд дахин оролдоно уу.",
};

function back(orderId: string, params: Record<string, string>) {
  redirect(`/dashboard/orders/${orderId}?${new URLSearchParams(params)}`);
}

export async function submitOrderAction(orderId: string, form: FormData) {
  const access = await requireUser();
  const ip = await clientIp();
  const ua = await userAgent();
  try {
    await asUser(access.user, (tx) =>
      tx`select app.submit_order(${orderId}::uuid, ${form.get("acceptTerms") === "on"}, ${isIp(ip) ? ip : null}::inet, ${ua})`,
    );
  } catch (e) {
    back(orderId, { error: MESSAGES[dbErrorCode(e) ?? ""] ?? "Захиалгыг илгээж чадсангүй." });
  }
  revalidatePath(`/dashboard/orders/${orderId}`);
  back(orderId, { submitted: "1" });
}

export async function reopenDraftAction(orderId: string) {
  const access = await requireUser();
  try {
    await asUser(access.user, (tx) => tx`select app.transition_order(${orderId}::uuid, 'draft', 'client reopened')`);
  } catch (e) {
    back(orderId, { error: MESSAGES[dbErrorCode(e) ?? ""] ?? "Үйлдэл амжилтгүй." });
  }
  redirect(`/order/m-check?edit=${orderId}`);
}

export async function cancelOrderAction(orderId: string) {
  const access = await requireUser();
  try {
    await asUser(access.user, (tx) => tx`select app.transition_order(${orderId}::uuid, 'cancelled', 'cancelled by client')`);
  } catch (e) {
    back(orderId, { error: MESSAGES[dbErrorCode(e) ?? ""] ?? "Цуцалж чадсангүй." });
  }
  back(orderId, { cancelled: "1" });
}

export async function startPaymentAction(orderId: string) {
  const access = await requireUser();
  if (!rateLimit("invoice", access.user.id, 10, 10 * 60_000).ok) back(orderId, { error: "Хэт олон оролдлого. Түр хүлээнэ үү." });
  try {
    await createInvoiceForOrder(access.user, orderId);
  } catch (e) {
    back(orderId, { error: MESSAGES[e instanceof PaymentError ? e.code : ""] ?? "Нэхэмжлэл үүсгэж чадсангүй." });
  }
  back(orderId, { pay: "1" });
}

export async function checkPaymentAction(orderId: string, paymentId: string) {
  const access = await requireUser();
  if (!rateLimit("payment-check", access.user.id, 30, 60_000).ok) back(orderId, { error: "Хэт олон шалгалт. Түр хүлээнэ үү." });
  // RLS: the user must be able to see this payment.
  const visible = await asUser(access.user, (tx) => tx`select id from payments where id = ${paymentId} and order_id = ${orderId}`);
  if (!visible.length) back(orderId, { error: MESSAGES.order_not_found });
  let status: string;
  try {
    status = (await verifyPayment(paymentId, "poll")).status;
  } catch (e) {
    back(orderId, { error: MESSAGES[e instanceof PaymentError ? e.code : ""] ?? "Төлбөр шалгаж чадсангүй." });
    return;
  }
  back(orderId, status === "paid" ? { paid: "1" } : { pay: "1", pending: "1" });
}

/** DEVELOPMENT ONLY: simulate paying the mock invoice from a bank app. */
export async function mockPayAction(orderId: string, paymentId: string) {
  const access = await requireUser();
  if (env().PAYMENT_PROVIDER !== "mock" || isProduction()) back(orderId, { error: "Туршилтын төлбөр идэвхгүй." });
  const rows = await asUser(access.user, (tx) => tx`select id from payments where id = ${paymentId} and order_id = ${orderId}`);
  if (!rows.length) back(orderId, { error: MESSAGES.order_not_found });
  const p = await asSystem((tx) => tx`select provider_invoice_id from payments where id = ${paymentId}`);
  mockMarkPaid(p[0].provider_invoice_id as string);
  await verifyPayment(paymentId, "callback");
  back(orderId, { paid: "1" });
}
