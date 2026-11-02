"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { asUser, dbErrorCode } from "@/lib/db";
import { DocumentError, uploadDocument } from "@/lib/documents/service";
import { dispatchEmails } from "@/lib/notify/email";
import { rateLimit } from "@/lib/rate-limit";

const UPLOAD_ERRORS: Record<string, string> = {
  file_required: "Файлаа сонгоно уу.",
  file_too_large: "Файлын хэмжээ 20MB-аас их байна.",
  file_type_not_allowed: "Зөвхөн PDF, JPG, PNG, WEBP, HEIC файл байршуулна.",
  file_infected: "Файлд хортой код илэрсэн тул хадгалаагүй.",
  order_not_found: "Энэ захиалгад файл нэмэх боломжгүй.",
};

/** Shared by client and staff pages; `back` is where to return. */
export async function uploadDocumentAction(orderId: string, back: string, form: FormData) {
  const access = await requireUser();
  const safeBack = back.startsWith("/dashboard/orders/") || back.startsWith("/admin/orders/") ? back : "/dashboard";
  if (!rateLimit("upload", access.user.id, 40, 60 * 60_000).ok) redirect(`${safeBack}?error=${encodeURIComponent("Хэт олон файл. Түр хүлээнэ үү.")}`);
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 10);
  const docType = String(form.get("documentType") ?? "other");
  const internal = form.get("internal") === "on" && access.isStaff;
  let error: string | null = files.length ? null : UPLOAD_ERRORS.file_required;
  for (const f of files) {
    try {
      await uploadDocument(access.user, orderId, f, { documentType: docType, isInternal: internal });
    } catch (e) {
      error = e instanceof DocumentError ? UPLOAD_ERRORS[e.code] ?? "Файл хадгалж чадсангүй." : "Файл хадгалж чадсангүй.";
      break;
    }
  }
  revalidatePath(safeBack);
  redirect(`${safeBack}?${error ? `error=${encodeURIComponent(error)}` : "uploaded=1"}`);
}

export async function infoProvidedAction(orderId: string, form: FormData) {
  const access = await requireUser();
  const note = String(form.get("note") ?? "").slice(0, 500);
  let err: string | null = null;
  try {
    await asUser(access.user, (tx) => tx`select app.client_info_provided(${orderId}::uuid, ${note})`);
  } catch (e) {
    err = dbErrorCode(e) === "transition_not_allowed" ? "Энэ үйлдэл одоо боломжгүй." : "Илгээж чадсангүй.";
  }
  await dispatchEmails().catch(() => {});
  redirect(`/dashboard/orders/${orderId}?${err ? `error=${encodeURIComponent(err)}` : "info=1"}`);
}

export async function feedbackAction(orderId: string, form: FormData) {
  const access = await requireUser();
  const parsed = z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().max(2000) }).safeParse({
    rating: form.get("rating"),
    comment: String(form.get("comment") ?? ""),
  });
  if (!parsed.success) redirect(`/dashboard/orders/${orderId}?error=${encodeURIComponent("Үнэлгээгээ сонгоно уу.")}`);
  try {
    await asUser(access.user, (tx) => tx`
      insert into order_feedback (order_id, client_id, rating, comment)
      values (${orderId}, ${access.user.id}, ${parsed.data.rating}, ${parsed.data.comment.trim() || null})`);
  } catch {
    redirect(`/dashboard/orders/${orderId}?error=${encodeURIComponent("Үнэлгээ хадгалж чадсангүй.")}`);
  }
  redirect(`/dashboard/orders/${orderId}?thanks=1`);
}

export async function markNotificationsReadAction() {
  const access = await requireUser();
  await asUser(access.user, (tx) => tx`update notifications set read_at = now() where user_id = ${access.user.id} and read_at is null`);
  revalidatePath("/dashboard/notifications");
  redirect("/dashboard/notifications");
}
