import { Alert, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { env } from "@/lib/env";
import { saveBranchAction } from "../actions";

export const metadata = { title: "Тохиргоо" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const access = await requireSuperAdmin("/admin/settings");
  const sp = await searchParams;
  const branches = await asUser(access.user, (tx) => tx`select * from branches order by created_at`);
  const e = env();
  const status: [string, string, boolean][] = [
    ["Нэвтрэлт", e.AUTH_PROVIDER === "supabase" ? "Supabase Auth" : "Локал (зөвхөн хөгжүүлэлт)", e.AUTH_PROVIDER === "supabase"],
    ["Төлбөр", e.PAYMENT_PROVIDER === "qpay" ? `QPay (${e.QPAY_BASE_URL})` : "Туршилтын (mock)", e.PAYMENT_PROVIDER === "qpay"],
    ["Файл хадгалалт", e.STORAGE_PROVIDER === "supabase" ? "Supabase Storage (хаалттай)" : "Локал диск", e.STORAGE_PROVIDER === "supabase"],
    ["Имэйл", process.env.RESEND_API_KEY ? "Resend" : "Тохируулаагүй (зөвхөн системд)", !!process.env.RESEND_API_KEY],
    ["Вирус шалгалт", process.env.MALWARE_SCAN_URL ? "Холбогдсон" : "Тохируулаагүй", !!process.env.MALWARE_SCAN_URL],
    ["Cron", process.env.CRON_SECRET ? "Тохируулсан" : "CRON_SECRET алга", !!process.env.CRON_SECRET],
  ];
  return (
    <>
      <PageHeader title="Тохиргоо" />
      <div className="mb-6 space-y-3">{sp.ok && <Alert tone="good">Хадгалагдлаа.</Alert>}{sp.error && <Alert tone="bad">{sp.error}</Alert>}</div>
      <Card className="mb-6">
        <h2 className="font-semibold">Системийн төлөв</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {status.map(([k, v, ok]) => (
            <li key={k} className="flex justify-between gap-3 py-2"><span>{k}</span><span className={ok ? "text-good" : "text-warn"}>{v}</span></li>
          ))}
        </ul>
      </Card>
      <h2 className="mb-3 font-semibold">Салбарууд</h2>
      <div className="space-y-4">
        {[...branches, null].map((b, i) => (
          <Card key={(b?.id as string) ?? "new"}>
            <form action={saveBranchAction} className="grid gap-4 sm:grid-cols-[100px_1fr_1fr_140px_120px_auto] sm:items-end">
              <input type="hidden" name="id" value={(b?.id as string) ?? ""} />
              <Field label="Код" name={`code-${i}`}><Input id={`code-${i}`} name="code" defaultValue={(b?.code as string) ?? ""} readOnly={!!b} required /></Field>
              <Field label={b ? "Нэр" : "Шинэ салбар"} name={`name-${i}`}><Input id={`name-${i}`} name="name" defaultValue={(b?.name as string) ?? ""} required /></Field>
              <Field label="Хаяг" name={`addr-${i}`}><Input id={`addr-${i}`} name="address" defaultValue={(b?.address as string) ?? ""} /></Field>
              <Field label="Утас" name={`ph-${i}`}><Input id={`ph-${i}`} name="phone" defaultValue={(b?.phone as string) ?? ""} /></Field>
              <Field label="Төлөв" name={`st-${i}`}>
                <Select id={`st-${i}`} name="status" defaultValue={(b?.status as string) ?? "active"}><option value="active">Идэвхтэй</option><option value="inactive">Идэвхгүй</option></Select>
              </Field>
              <Button variant={b ? "secondary" : "primary"}>{b ? "Хадгалах" : "Нэмэх"}</Button>
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}
