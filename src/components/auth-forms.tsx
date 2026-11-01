"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction, type AuthFormState } from "@/app/login/actions";
import { Alert, Button, Field, Input } from "./ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message && <Alert tone="bad">{state.message}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Имэйл" name="email" error={state.errors?.email} required>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email}
          aria-invalid={!!state.errors?.email} aria-describedby={state.errors?.email ? "email-error" : undefined} />
      </Field>
      <Field label="Нууц үг" name="password" error={state.errors?.password} required>
        <Input id="password" name="password" type="password" autoComplete="current-password" required
          aria-invalid={!!state.errors?.password} aria-describedby={state.errors?.password ? "password-error" : undefined} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Нэвтэрч байна…" : "Нэвтрэх"}</Button>
      <p className="text-center text-sm text-muted">
        Бүртгэлгүй юу? <Link className="font-semibold text-accent" href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Бүртгүүлэх</Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(registerAction, {});
  const e = state.errors ?? {};
  const inv = (k: string) => ({ "aria-invalid": !!e[k], "aria-describedby": e[k] ? `${k}-error` : `${k}-hint` });
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message && <Alert tone={state.errors ? "bad" : "accent"}>{state.message}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Овог, нэр" name="fullName" error={e.fullName} required>
        <Input id="fullName" name="fullName" autoComplete="name" required defaultValue={state.values?.fullName} {...inv("fullName")} />
      </Field>
      <Field label="Имэйл" name="email" error={e.email} required>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} {...inv("email")} />
      </Field>
      <Field label="Утас" name="phone" error={e.phone} hint="Захиалгын талаар холбогдоход ашиглана">
        <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="9911 2233" defaultValue={state.values?.phone} {...inv("phone")} />
      </Field>
      <Field label="Нууц үг" name="password" error={e.password} hint="Дор хаяж 10 тэмдэгт, үсэг болон тоо" required>
        <Input id="password" name="password" type="password" autoComplete="new-password" required {...inv("password")} />
      </Field>
      <div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="acceptTerms" className="mt-1 size-4 accent-[var(--accent)]" aria-invalid={!!e.acceptTerms} />
          <span>
            Симкас Пропертиз ХХК-ийн (M Properties) <Link href="/legal/terms" className="font-semibold text-accent" target="_blank">үйлчилгээний нөхцөл</Link>,{" "}
            <Link href="/legal/privacy" className="font-semibold text-accent" target="_blank">хувийн мэдээллийн бодлого</Link>-ыг уншиж зөвшөөрч байна.
          </span>
        </label>
        {e.acceptTerms && <p className="mt-1 text-xs font-medium text-bad">{e.acceptTerms}</p>}
      </div>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Бүртгэж байна…" : "Бүртгүүлэх"}</Button>
      <p className="text-center text-sm text-muted">
        Бүртгэлтэй юу? <Link className="font-semibold text-accent" href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Нэвтрэх</Link>
      </p>
    </form>
  );
}
