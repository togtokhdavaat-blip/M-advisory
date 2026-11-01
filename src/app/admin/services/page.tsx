import { Alert, Badge, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { updateServiceAction } from "../actions";

export const metadata = { title: "Үйлчилгээ" };

export default async function AdminServices({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const access = await requireSuperAdmin("/admin/services");
  const sp = await searchParams;
  const services = await asUser(access.user, (tx) => tx`select * from services order by sort_order`);
  return (
    <>
      <PageHeader title="Үйлчилгээ" description="Агуулга, нөхцөл, идэвхжүүлэлт. Онлайн захиалга нээхэд тухайн үйлчилгээний үнэ батлагдсан байх шаардлагатай." />
      <div className="mb-6 space-y-3">{sp.ok && <Alert tone="good">Хадгалагдлаа.</Alert>}{sp.error && <Alert tone="bad">{sp.error}</Alert>}</div>
      <div className="space-y-4">
        {services.map((s) => (
          <details key={s.id as string} className="rounded-xl border border-line bg-surface">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4">
              <span className="font-semibold">{s.name as string} <span className="font-normal text-muted">· {s.tagline as string}</span></span>
              <span className="flex gap-2">
                <Badge tone={s.is_active ? "good" : "neutral"}>{s.is_active ? "Нийтэд харагдана" : "Нуусан"}</Badge>
                {s.is_orderable && <Badge tone="accent">Онлайн захиалга</Badge>}
              </span>
            </summary>
            <Card className="m-4 mt-0 border-0 p-0 sm:p-0">
              <form action={updateServiceAction.bind(null, s.id as string)} className="grid gap-4 p-4 sm:grid-cols-2">
                <Field label="Нэр" name={`name-${s.id}`}><Input id={`name-${s.id}`} name="name" defaultValue={s.name as string} /></Field>
                <Field label="Товч тайлбар" name={`tagline-${s.id}`}><Input id={`tagline-${s.id}`} name="tagline" defaultValue={s.tagline as string} /></Field>
                <div className="sm:col-span-2"><Field label="Тайлбар" name={`d-${s.id}`}><Textarea id={`d-${s.id}`} name="description" defaultValue={s.description as string} /></Field></div>
                <Field label="Үр дүн" name={`del-${s.id}`}><Textarea id={`del-${s.id}`} name="deliverable" rows={2} defaultValue={s.deliverable as string} /></Field>
                <Field label="Хугацаа" name={`t-${s.id}`}><Textarea id={`t-${s.id}`} name="turnaroundText" rows={2} defaultValue={s.turnaround_text as string} /></Field>
                <Field label="Хамрах хүрээ (мөр бүрт нэг)" name={`sc-${s.id}`}><Textarea id={`sc-${s.id}`} name="scopeItems" rows={5} defaultValue={(s.scope_items as string[]).join("\n")} /></Field>
                <Field label="Хамаарахгүй (мөр бүрт нэг)" name={`ex-${s.id}`}><Textarea id={`ex-${s.id}`} name="excludedItems" rows={5} defaultValue={(s.excluded_items as string[]).join("\n")} /></Field>
                <Field label="Нөхцөлийн хувилбар" name={`tv-${s.id}`} hint="Текст өөрчлөх бүрт хувилбараа шинэчилнэ"><Input id={`tv-${s.id}`} name="termsVersion" defaultValue={s.terms_version as string} /></Field>
                <div className="sm:col-span-2"><Field label="Үйлчилгээний нөхцөл" name={`tt-${s.id}`}><Textarea id={`tt-${s.id}`} name="termsText" rows={6} defaultValue={s.terms_text as string} /></Field></div>
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="isActive" defaultChecked={s.is_active as boolean} className="size-4" /> Нийтэд харуулах</label>
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="isOrderable" defaultChecked={s.is_orderable as boolean} className="size-4" /> Онлайн захиалга нээх</label>
                <div className="sm:col-span-2"><Button>Хадгалах</Button></div>
              </form>
            </Card>
          </details>
        ))}
      </div>
    </>
  );
}
