"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff, requireSuperAdmin, requireAdmin } from "@/lib/authz";
import { asUser, dbErrorCode } from "@/lib/db";
import { ORDER_STATUSES } from "@/lib/orders/state-machine";

const uuid = z.string().uuid();

const MESSAGES: Record<string, string> = {
  transition_not_allowed: "Энэ шилжилтийг хийх эрхгүй эсвэл боломжгүй төлөв.",
  reason_required: "Шалтгаанаа бичнэ үү.",
  assignee_lacks_role: "Сонгосон хүн энэ салбарт тухайн эрхгүй байна.",
  reviewer_must_differ_from_advisor: "Хянагч нь зөвлөхөөс өөр хүн байх ёстой.",
  order_not_assignable_in_status: "Төлбөр төлөгдөөгүй захиалгыг хуваарилах боломжгүй.",
  order_not_found: "Захиалга олдсонгүй.",
  forbidden: "Эрх хүрэлцэхгүй байна.",
  price_in_use_create_new_version: "Ашиглагдсан үнийг өөрчлөх боломжгүй — шинэ хувилбар үүснэ.",
};
const msg = (e: unknown, fallback: string) => MESSAGES[dbErrorCode(e) ?? ""] ?? fallback;

function backTo(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params)}`);
}

export async function assignAction(orderId: string, form: FormData) {
  const access = await requireAdmin();
  const userId = uuid.safeParse(form.get("userId"));
  const role = z.enum(["advisor", "reviewer"]).safeParse(form.get("role"));
  const path = `/admin/orders/${orderId}`;
  if (!userId.success || !role.success) backTo(path, { error: "Хүнээ сонгоно уу." });
  try {
    await asUser(access.user, (tx) => tx`select app.assign_order(${orderId}::uuid, ${userId.data}::uuid, ${role.data}::assignment_role)`);
  } catch (e) {
    backTo(path, { error: msg(e, "Хуваарилж чадсангүй.") });
  }
  revalidatePath(path);
  backTo(path, { ok: "assigned" });
}

export async function transitionAction(orderId: string, form: FormData) {
  const access = await requireStaff();
  const to = z.enum(ORDER_STATUSES).safeParse(form.get("to"));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 1000) || null;
  const path = `/admin/orders/${orderId}`;
  if (!to.success) backTo(path, { error: "Буруу төлөв." });
  try {
    await asUser(access.user, (tx) => tx`select app.transition_order(${orderId}::uuid, ${to.data}::order_status, ${reason})`);
  } catch (e) {
    backTo(path, { error: msg(e, "Төлөв өөрчилж чадсангүй.") });
  }
  revalidatePath(path);
  backTo(path, { ok: "status" });
}

// ---- Catalogue (super admin) ----
const serviceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(200),
  description: z.string().trim().max(4000),
  deliverable: z.string().trim().max(1000),
  turnaroundText: z.string().trim().max(500),
  scopeItems: z.string().max(4000),
  excludedItems: z.string().max(4000),
  termsVersion: z.string().trim().min(1).max(40),
  termsText: z.string().trim().max(20000),
  isActive: z.boolean(),
  isOrderable: z.boolean(),
});

export async function updateServiceAction(serviceId: string, form: FormData) {
  const access = await requireSuperAdmin();
  const parsed = serviceSchema.safeParse({
    name: form.get("name"), tagline: form.get("tagline"), description: form.get("description"),
    deliverable: form.get("deliverable"), turnaroundText: form.get("turnaroundText"),
    scopeItems: form.get("scopeItems") ?? "", excludedItems: form.get("excludedItems") ?? "",
    termsVersion: form.get("termsVersion"), termsText: form.get("termsText") ?? "",
    isActive: form.get("isActive") === "on", isOrderable: form.get("isOrderable") === "on",
  });
  const path = "/admin/services";
  if (!parsed.success) backTo(path, { error: "Талбаруудаа шалгана уу.", edit: serviceId });
  const d = parsed.data;
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 30);
  try {
    await asUser(access.user, async (tx) => {
      const r = await tx`
        update services set name = ${d.name}, tagline = ${d.tagline}, description = ${d.description},
          deliverable = ${d.deliverable}, turnaround_text = ${d.turnaroundText},
          scope_items = ${tx.json(lines(d.scopeItems))}, excluded_items = ${tx.json(lines(d.excludedItems))},
          terms_version = ${d.termsVersion}, terms_text = ${d.termsText},
          is_active = ${d.isActive || d.isOrderable}, is_orderable = ${d.isOrderable}
        where id = ${serviceId} returning id`;
      if (!r.length) throw new Error("forbidden");
    });
  } catch (e) {
    backTo(path, { error: msg(e, "Хадгалж чадсангүй.") });
  }
  revalidatePath("/", "layout");
  backTo(path, { ok: "1" });
}

export async function setPriceStatusAction(priceId: string, form: FormData) {
  const access = await requireSuperAdmin();
  const status = z.enum(["proposed", "approved", "retired"]).safeParse(form.get("status"));
  if (!status.success) backTo("/admin/pricing", { error: "Буруу төлөв." });
  try {
    await asUser(access.user, (tx) => tx`select app.revise_service_price(${priceId}::uuid, null, null, ${status.data}::price_status)`);
  } catch (e) {
    backTo("/admin/pricing", { error: msg(e, "Өөрчилж чадсангүй.") });
  }
  revalidatePath("/", "layout");
  backTo("/admin/pricing", { ok: "1" });
}

export async function revisePriceAction(priceId: string, form: FormData) {
  const access = await requireSuperAdmin();
  const amount = z.coerce.number().int().min(0).max(1_000_000_000).safeParse(String(form.get("amount") ?? "").replace(/[,\s₮]/g, ""));
  if (!amount.success) backTo("/admin/pricing", { error: "Дүнг бүхэл төгрөгөөр оруулна уу." });
  try {
    await asUser(access.user, (tx) => tx`select app.revise_service_price(${priceId}::uuid, ${amount.data}, null, 'proposed'::price_status)`);
  } catch (e) {
    backTo("/admin/pricing", { error: msg(e, "Өөрчилж чадсангүй.") });
  }
  revalidatePath("/", "layout");
  backTo("/admin/pricing", { ok: "1" });
}

export async function approveAllProposedAction(serviceId: string) {
  const access = await requireSuperAdmin();
  try {
    await asUser(access.user, async (tx) => {
      const rows = await tx`select id from service_prices where service_id = ${serviceId} and status = 'proposed' and effective_to is null`;
      for (const r of rows) await tx`select app.revise_service_price(${r.id}::uuid, null, null, 'approved'::price_status)`;
    });
  } catch (e) {
    backTo("/admin/pricing", { error: msg(e, "Батлаж чадсангүй.") });
  }
  revalidatePath("/", "layout");
  backTo("/admin/pricing", { ok: "1" });
}

// ---- Team ----
export async function grantRoleAction(form: FormData) {
  const access = await requireAdmin();
  const email = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  const role = z.enum(["ADVISOR", "REVIEWER", "BRANCH_ADMIN", "SUPER_ADMIN"]).safeParse(form.get("role"));
  const branch = String(form.get("branchId") ?? "");
  if (!email.success || !role.success) backTo("/admin/advisors", { error: "Имэйл, эрхээ зөв оруулна уу." });
  const branchId = role.data === "SUPER_ADMIN" ? null : uuid.safeParse(branch).success ? branch : null;
  if (role.data !== "SUPER_ADMIN" && !branchId) backTo("/admin/advisors", { error: "Салбараа сонгоно уу." });
  try {
    await asUser(access.user, async (tx) => {
      const u = await tx`select app.find_user_id_by_email(${email.data}) as id`;
      if (!u[0]?.id) throw new Error("user_not_found: not registered");
      await tx`select app.grant_role(${u[0].id}::uuid, ${role.data}::app_role, ${branchId}::uuid)`;
    });
  } catch (e) {
    const c = dbErrorCode(e);
    backTo("/admin/advisors", { error: c === "user_not_found" ? "Энэ имэйлтэй хэрэглэгч олдсонгүй. Эхлээд бүртгүүлэх шаардлагатай." : msg(e, "Эрх олгож чадсангүй.") });
  }
  revalidatePath("/admin/advisors");
  backTo("/admin/advisors", { ok: "1" });
}

export async function revokeRoleAction(membershipId: string) {
  const access = await requireAdmin();
  try {
    await asUser(access.user, (tx) => tx`select app.revoke_role(${membershipId}::uuid)`);
  } catch (e) {
    backTo("/admin/advisors", { error: msg(e, "Эрх хасаж чадсангүй.") });
  }
  revalidatePath("/admin/advisors");
  backTo("/admin/advisors", { ok: "1" });
}
