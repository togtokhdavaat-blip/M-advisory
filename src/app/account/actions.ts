"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { asUser } from "@/lib/db";

const schema = z.object({
  fullName: z.string().trim().min(2, "Овог нэрээ оруулна уу").max(200),
  phone: z.string().trim().transform((v) => v.replace(/[\s-]/g, "")).refine((v) => v === "" || /^\+?[0-9]{8,15}$/.test(v), "Утасны дугаар буруу"),
});

export interface ProfileState { ok?: boolean; error?: string }

export async function updateProfileAction(_: ProfileState, form: FormData): Promise<ProfileState> {
  const access = await requireUser("/account");
  const parsed = schema.safeParse({ fullName: form.get("fullName"), phone: form.get("phone") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  // RLS + column grants: a user can update only full_name/phone/locale on their own row.
  await asUser(access.user, (tx) => tx`update profiles set full_name = ${parsed.data.fullName}, phone = ${parsed.data.phone || null} where id = ${access.user.id}`);
  revalidatePath("/account");
  return { ok: true };
}
