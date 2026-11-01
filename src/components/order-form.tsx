"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveOrderDraftAction, type OrderFormState } from "@/app/order/actions";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABEL, UB_DISTRICTS } from "@/lib/labels";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "./ui";

export type OrderFormValues = Partial<Record<string, string>>;
const STORAGE_KEY = "ma-order-draft";

export function OrderForm({ serviceSlug, initial, isAuthed }: { serviceSlug: string; initial: OrderFormValues; isAuthed: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<OrderFormValues>(initial);
  const [version, setVersion] = useState(0);
  const [propertyType, setPropertyType] = useState(initial.propertyType ?? "");
  const [clientIsBuyer, setClientIsBuyer] = useState(initial.clientIsBuyer !== "off");
  const [state, action, pending] = useActionState<OrderFormState, FormData>(saveOrderDraftAction.bind(null, serviceSlug), {});

  // Restore a draft the visitor filled in before signing up.
  useEffect(() => {
    if (params.get("resume") !== "1") return;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const v = JSON.parse(saved) as OrderFormValues;
        setValues(v);
        setPropertyType(v.propertyType ?? "");
        setClientIsBuyer(v.clientIsBuyer === "on");
        setVersion((n) => n + 1);
      }
    } catch {}
  }, [params]);

  // React resets the form after the action returns, so the draft is captured
  // on submit; it is only kept if the server says the visitor must sign up.
  useEffect(() => {
    if (!state.needsAuth) return;
    router.push(`/register?next=${encodeURIComponent(`/order/${serviceSlug}?resume=1`)}`);
  }, [state, router, serviceSlug]);

  const e = state.errors ?? {};
  const a = (k: string) => ({
    id: k,
    name: k,
    defaultValue: values[k] ?? "",
    "aria-invalid": !!e[k],
    "aria-describedby": e[k] ? `${k}-error` : undefined,
  });

  return (
    <form ref={formRef} action={action} key={version} className="space-y-6" noValidate
      onSubmit={(ev) => {
        try {
          if (isAuthed) sessionStorage.removeItem(STORAGE_KEY);
          else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(new FormData(ev.currentTarget).entries())));
        } catch {}
      }}>
      <input type="hidden" name="orderId" value={values.orderId ?? ""} />
      {state.message && <Alert tone="bad">{state.message}</Alert>}

      <Card className="space-y-5">
        <h2 className="font-semibold">1. Хөрөнгийн мэдээлэл</h2>
        <Field label="Хөрөнгийн төрөл" name="propertyType" error={e.propertyType} required>
          <Select {...a("propertyType")} onChange={(ev) => setPropertyType(ev.target.value)} required>
            <option value="">Сонгох…</option>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        {propertyType === "new_project" && (
          <Field label="Төслийн нэр" name="projectName" error={e.projectName} required>
            <Input {...a("projectName")} placeholder="Жишээ: ... хотхон, 3-р блок" />
          </Field>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Дүүрэг" name="district" error={e.district}>
            <Select {...a("district")}>
              <option value="">Сонгох…</option>
              {UB_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
              <option value="Орон нутаг">Орон нутаг</option>
            </Select>
          </Field>
          <Field label="Хороо" name="khoroo" error={e.khoroo}>
            <Input {...a("khoroo")} placeholder="Жишээ: 11-р хороо" />
          </Field>
        </div>
        <Field label="Хаяг" name="address" error={e.address} hint="Байр, орц, тоот эсвэл байршлын тайлбар" required>
          <Textarea {...a("address")} rows={2} required />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Талбай (м²)" name="areaSqm" error={e.areaSqm}>
            <Input {...a("areaSqm")} inputMode="decimal" />
          </Field>
          {propertyType !== "land" && (
            <>
              <Field label="Өрөө" name="rooms" error={e.rooms}><Input {...a("rooms")} inputMode="numeric" /></Field>
              <Field label="Давхар" name="floor" error={e.floor}><Input {...a("floor")} inputMode="numeric" /></Field>
            </>
          )}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Ашиглалтад орсон он" name="buildYear" error={e.buildYear}><Input {...a("buildYear")} inputMode="numeric" /></Field>
          <Field label="Зарагдаж буй үнэ (₮)" name="askingPriceMnt" error={e.askingPriceMnt} hint="Хөлсийг тооцоход ашиглана" required>
            <Input {...a("askingPriceMnt")} inputMode="numeric" placeholder="350000000" required />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Улсын бүртгэлийн дугаар" name="registrationNumber" error={e.registrationNumber} hint="Мэдэж байвал">
            <Input {...a("registrationNumber")} placeholder="Ү-2204..." />
          </Field>
          <Field label="Нэгж талбарын дугаар" name="cadastralNumber" error={e.cadastralNumber} hint="Газар, хаусад">
            <Input {...a("cadastralNumber")} />
          </Field>
        </div>
        <Field label="Зарын линк" name="listingUrl" error={e.listingUrl}><Input {...a("listingUrl")} type="url" placeholder="https://" /></Field>
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">2. Холбогдох талууд</h2>
        <p className="text-sm text-muted">Өмчлөгч, худалдан авагч, захиалагч (та) өөр хүмүүс байж болно.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Өмчлөгч / худалдагчийн нэр" name="ownerName" error={e.ownerName} hint="Мэдэж байвал"><Input {...a("ownerName")} /></Field>
          <Field label="Өмчлөгчийн утас" name="ownerPhone" error={e.ownerPhone}><Input {...a("ownerPhone")} type="tel" /></Field>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="clientIsBuyer" checked={clientIsBuyer} onChange={(ev) => setClientIsBuyer(ev.target.checked)} className="size-4 accent-[var(--accent)]" />
          Худалдан авагч нь би өөрөө
        </label>
        {!clientIsBuyer && (
          <Field label="Худалдан авагчийн нэр" name="buyerName" error={e.buyerName} required><Input {...a("buyerName")} /></Field>
        )}
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">3. Нэмэлт мэдээлэл</h2>
        <Field label="Анхаарах зүйл, асуулт" name="notes" error={e.notes}>
          <Textarea {...a("notes")} rows={4} placeholder="Жишээ: Барьцаанд байгаа эсэхийг сайн шалгуулмаар байна." />
        </Field>
        <p className="text-xs text-muted">Баримт бичгээ захиалга хадгалсны дараа хаалттай сан руу байршуулна.</p>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Хадгалж байна…" : isAuthed ? "Хадгалаад үргэлжлүүлэх" : "Бүртгүүлээд үргэлжлүүлэх"}
        </Button>
      </div>
    </form>
  );
}
