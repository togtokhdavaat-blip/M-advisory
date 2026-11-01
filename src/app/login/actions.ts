"use server";

import { redirect } from "next/navigation";
import { authProvider } from "@/lib/auth";
import { safeNext } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, isIp, userAgent } from "@/lib/request";
import { fieldErrors, loginSchema, registerSchema, type FieldErrors } from "@/lib/validation/auth";

export interface AuthFormState {
  errors?: FieldErrors;
  message?: string;
  values?: Record<string, string>;
}

export async function loginAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const ip = await clientIp();
  const values = { email: String(form.get("email") ?? "") };
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const ipLimit = rateLimit("login-ip", ip, 20, 15 * 60_000);
  const emailLimit = rateLimit("login-email", parsed.data.email, 8, 15 * 60_000);
  if (!ipLimit.ok || !emailLimit.ok) {
    return { message: "Хэт олон оролдлого хийлээ. 15 минутын дараа дахин оролдоно уу.", values };
  }

  const result = await authProvider().signIn(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    return {
      message: result.error === "rate_limited" ? "Хэт олон оролдлого хийлээ. Түр хүлээгээд дахин оролдоно уу." : "Имэйл эсвэл нууц үг буруу байна.",
      values,
    };
  }
  redirect(safeNext(form.get("next")));
}

export async function registerAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const ip = await clientIp();
  const values = {
    fullName: String(form.get("fullName") ?? ""),
    email: String(form.get("email") ?? ""),
    phone: String(form.get("phone") ?? ""),
  };
  const parsed = registerSchema.safeParse({
    fullName: form.get("fullName"),
    email: form.get("email"),
    phone: form.get("phone") ?? "",
    password: form.get("password"),
    acceptTerms: form.get("acceptTerms"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  if (!rateLimit("register-ip", ip, 5, 60 * 60_000).ok) {
    return { message: "Энэ сүлжээнээс хэт олон бүртгэл үүслээ. Дараа дахин оролдоно уу.", values };
  }

  const result = await authProvider().register({
    email: parsed.data.email,
    password: parsed.data.password,
    fullName: parsed.data.fullName,
    phone: parsed.data.phone || undefined,
  });
  if (!result.ok) {
    if (result.error === "email_taken") return { errors: { email: "Энэ имэйлээр бүртгэл үүссэн байна. Нэвтэрнэ үү." }, values };
    if (result.error === "weak_password") return { errors: { password: "Нууц үг хэт сул байна." }, values };
    return { message: "Бүртгэл үүсгэж чадсангүй. Дахин оролдоно уу.", values };
  }

  // Record platform consents (RLS: a user may only insert their own).
  const ua = await userAgent();
  await asUser(result.user, (tx) => tx`
    insert into consents (user_id, consent_type, version, ip_address, user_agent)
    values (${result.user.id}, 'terms_of_service', ${TERMS_VERSION}, ${isIp(ip) ? ip : null}, ${ua}),
           (${result.user.id}, 'privacy_policy', ${PRIVACY_VERSION}, ${isIp(ip) ? ip : null}, ${ua})`);

  if (result.needsEmailConfirmation) {
    return { message: "Бүртгэл үүслээ. Имэйл рүү илгээсэн холбоосоор хаягаа баталгаажуулна уу." };
  }
  redirect(safeNext(form.get("next")));
}

export async function logoutAction() {
  await authProvider().signOut();
  redirect("/");
}
