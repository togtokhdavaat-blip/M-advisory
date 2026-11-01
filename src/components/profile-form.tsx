"use client";
import { useActionState } from "react";
import { updateProfileAction, type ProfileState } from "@/app/account/actions";
import { Alert, Button, Field, Input } from "./ui";

export function ProfileForm({ fullName, phone, email }: { fullName: string; phone: string; email: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfileAction, {});
  return (
    <form action={action} className="space-y-5">
      {state.ok && <Alert tone="good">Хадгалагдлаа.</Alert>}
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      <Field label="Имэйл" name="email"><Input id="email" value={email} disabled readOnly /></Field>
      <Field label="Овог, нэр" name="fullName" required><Input id="fullName" name="fullName" defaultValue={fullName} autoComplete="name" /></Field>
      <Field label="Утас" name="phone"><Input id="phone" name="phone" defaultValue={phone} type="tel" autoComplete="tel" /></Field>
      <Button disabled={pending}>{pending ? "Хадгалж байна…" : "Хадгалах"}</Button>
    </form>
  );
}
