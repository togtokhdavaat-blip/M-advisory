"use server";

import { redirect } from "next/navigation";
import { getAccess } from "@/lib/authz";
import { asUser, dbErrorCode } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { fieldErrors, type FieldErrors } from "@/lib/validation/auth";
import { orderDraftSchema, toDbPayload } from "@/lib/validation/order";

export interface OrderFormState {
  errors?: FieldErrors;
  message?: string;
  needsAuth?: boolean;
}

const SERVICE_CODES: Record<string, string> = { "m-check": "M_CHECK" };

const DB_MESSAGES: Record<string, string> = {
  service_not_orderable: "Энэ үйлчилгээг одоогоор онлайнаар захиалах боломжгүй.",
  order_not_editable: "Энэ захиалгыг засах боломжгүй төлөвт байна.",
  order_not_found: "Захиалга олдсонгүй.",
  branch_not_available: "Салбар идэвхгүй байна.",
};

export async function saveOrderDraftAction(serviceSlug: string, _: OrderFormState, form: FormData): Promise<OrderFormState> {
  const access = await getAccess();
  if (!access) return { needsAuth: true };

  const code = SERVICE_CODES[serviceSlug];
  if (!code) return { message: DB_MESSAGES.service_not_orderable };

  if (!rateLimit("order-draft", access.user.id, 30, 60 * 60_000).ok) {
    return { message: "Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу." };
  }

  const raw = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = orderDraftSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Мэдээллээ шалгана уу." };

  const { property, parties } = toDbPayload(parsed.data, access.fullName);
  let orderId: string;
  try {
    orderId = await asUser(access.user, async (tx) => {
      const rows = parsed.data.orderId
        ? await tx`select (app.update_order_draft(${parsed.data.orderId}::uuid, ${tx.json(property)}, ${tx.json(parties as never)}, ${parsed.data.notes ?? null})).id`
        : await tx`select (app.create_order_draft(${code}, ${tx.json(property)}, ${tx.json(parties as never)}, ${parsed.data.notes ?? null})).id`;
      return rows[0].id as string;
    });
  } catch (e) {
    const c = dbErrorCode(e);
    return { message: (c && DB_MESSAGES[c]) || "Захиалгыг хадгалж чадсангүй. Дахин оролдоно уу." };
  }
  redirect(`/dashboard/orders/${orderId}?saved=1`);
}
