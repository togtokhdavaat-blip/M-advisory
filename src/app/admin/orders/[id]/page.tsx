import { notFound } from "next/navigation";
import Link from "next/link";
import { DocumentsPanel, type DocRow } from "@/components/documents-panel";
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireStaff } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { formatDate, formatMnt } from "@/lib/format";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PARTY_ROLE_LABEL, PAYMENT_STATUS_LABEL, PROPERTY_TYPE_LABEL, type PropertyType } from "@/lib/labels";
import { nextStatuses, type Actor, type OrderStatus } from "@/lib/orders/state-machine";
import { assignAction, refundAction, requestInfoAction, transitionAction } from "../../actions";

export const metadata = { title: "Захиалга" };

export default async function AdminOrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const access = await requireStaff(`/admin/orders/${id}`);
  const data = await asUser(access.user, async (tx) => {
    const o = (await tx`
      select o.*, s.name as service, b.name as branch, c.full_name as client_name, c.email as client_email, c.phone as client_phone
      from orders o join services s on s.id = o.service_id join branches b on b.id = o.branch_id
      left join profiles c on c.id = o.client_id where o.id = ${id}`)[0];
    if (!o) return null;
    const [property, parties, assignments, history, payments, caps, staff, documents, reports] = await Promise.all([
      tx`select * from properties where id = ${o.property_id}`,
      tx`select * from order_parties where order_id = ${id}`,
      tx`select a.role, a.assigned_at, p.full_name from order_assignments a join profiles p on p.id = a.user_id where a.order_id = ${id} and a.is_active`,
      tx`select h.*, p.full_name as by_name from order_status_history h left join profiles p on p.id = h.changed_by where h.order_id = ${id} order by h.created_at desc`,
      tx`select * from payments where order_id = ${id} order by created_at desc`,
      tx`select app.order_actor_capacities(${id}::uuid) as caps`,
      tx`select m.user_id, m.role, p.full_name from memberships m join profiles p on p.id = m.user_id
         where m.branch_id = ${o.branch_id} and m.is_active and m.role in ('ADVISOR', 'REVIEWER') order by p.full_name`,
      tx`select d.id, d.original_name, d.size_bytes, d.created_at, d.scan_status, d.is_internal, p.full_name as uploader
         from documents d left join profiles p on p.id = d.uploaded_by where d.order_id = ${id} and d.deleted_at is null order by d.created_at desc`,
      tx`select id, version, status from reports where order_id = ${id} order by version desc limit 1`,
    ]);
    return { o, property: property[0], parties, assignments, history, payments, caps: (caps[0].caps as Actor[]) ?? [], staff, documents, latestReport: reports[0] ?? null };
  });
  if (!data) notFound();
  const { o, property, parties, assignments, history, payments, caps, staff, documents, latestReport } = data;
  const status = o.status as OrderStatus;
  const isAdmin = caps.includes("admin");
  // needs_information goes through the request form; under_review/completed through the report workflow.
  const moves = nextStatuses(status, caps).filter((m) => !["needs_information", "under_review"].includes(m));
  const isAdvisor = caps.includes("advisor");
  const refundable = status === "cancelled" ? payments.filter((p) => ["paid", "refund_pending"].includes(p.status as string)) : [];
  const advisors = staff.filter((s) => s.role === "ADVISOR");
  const reviewers = staff.filter((s) => s.role === "REVIEWER");

  return (
    <>
      <PageHeader eyebrow={`${o.service as string} · ${o.branch as string}`} title={o.order_number as string}
        actions={<Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>} />
      <div className="mb-6 space-y-3">
        {sp.ok && <Alert tone="good">Амжилттай.</Alert>}
        {sp.error && <Alert tone="bad">{sp.error}</Alert>}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <h2 className="font-semibold">Харилцагч</h2>
            <p className="mt-2 text-sm">{o.client_name as string} · {o.client_email as string} · {(o.client_phone as string) || "—"}</p>
            {o.client_notes && <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">{o.client_notes as string}</p>}
          </Card>
          {property && (
            <Card>
              <h2 className="font-semibold">Хөрөнгө</h2>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted">Төрөл</dt><dd>{PROPERTY_TYPE_LABEL[property.property_type as PropertyType]}</dd></div>
                <div><dt className="text-xs text-muted">Үнэ</dt><dd>{formatMnt(property.asking_price_mnt as number)}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-muted">Хаяг</dt><dd>{[property.district, property.khoroo, property.address].filter(Boolean).join(", ")}</dd></div>
                <div><dt className="text-xs text-muted">Бүртгэлийн дугаар</dt><dd>{(property.registration_number as string) || "—"}</dd></div>
                <div><dt className="text-xs text-muted">Нэгж талбар</dt><dd>{(property.cadastral_number as string) || "—"}</dd></div>
                {property.listing_url && <div className="sm:col-span-2"><dt className="text-xs text-muted">Зар</dt><dd><a className="break-all text-accent" href={property.listing_url as string} rel="noopener noreferrer nofollow" target="_blank">{property.listing_url as string}</a></dd></div>}
              </dl>
              <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
                {parties.map((p, i) => <li key={i}><span className="text-muted">{PARTY_ROLE_LABEL[p.party_role as string]}:</span> {p.full_name as string}{p.phone ? ` · ${p.phone}` : ""}{p.is_client ? " (захиалагч)" : ""}</li>)}
              </ul>
            </Card>
          )}
          <Card>
            <h2 className="font-semibold">Төлбөр</h2>
            <p className="mt-2 text-sm">Дүн: <b className="tabular-nums">{formatMnt(o.amount_mnt as number | null)}</b>{o.price_snapshot ? ` · ${(o.price_snapshot as { label?: string }).label ?? ""}` : ""}</p>
            <ul className="mt-3 divide-y divide-line text-sm">
              {payments.map((p) => (
                <li key={p.id as string} className="flex justify-between py-2"><span>{p.provider as string} · {formatDate(p.created_at as string, true)}</span><span>{PAYMENT_STATUS_LABEL[p.status as string]}</span></li>
              ))}
              {payments.length === 0 && <li className="py-2 text-muted">Нэхэмжлэл үүсээгүй.</li>}
            </ul>
          </Card>
          <DocumentsPanel orderId={id} back={`/admin/orders/${id}`} docs={documents as unknown as DocRow[]} staff
            canUpload={!["draft", "cancelled"].includes(status)} />
          <Card>
            <h2 className="font-semibold">Төлөвийн түүх</h2>
            <ul className="mt-3 divide-y divide-line text-sm">
              {history.map((h) => (
                <li key={h.id as string} className="py-2">
                  <span className="font-medium">{h.from_status ? `${ORDER_STATUS_LABEL[h.from_status as OrderStatus]} → ` : ""}{ORDER_STATUS_LABEL[h.to_status as OrderStatus]}</span>
                  <span className="block text-xs text-muted">{formatDate(h.created_at as string, true)} · {(h.by_name as string) || "Систем"}{h.reason ? ` · ${h.reason}` : ""}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="font-semibold">Хуваарилалт</h2>
            <ul className="text-sm">
              {assignments.map((a, i) => <li key={i}>{a.role === "advisor" ? "Зөвлөх" : "Хянагч"}: <b>{a.full_name as string}</b></li>)}
              {assignments.length === 0 && <li className="text-muted">Хуваарилагдаагүй.</li>}
            </ul>
            {isAdmin && !["draft", "awaiting_payment", "completed", "cancelled"].includes(status) && (
              <>
                <form action={assignAction.bind(null, id)} className="space-y-2">
                  <input type="hidden" name="role" value="advisor" />
                  <Field label="Зөвлөх" name="advisor">
                    <Select id="advisor" name="userId" defaultValue=""><option value="">Сонгох…</option>{advisors.map((s) => <option key={s.user_id as string} value={s.user_id as string}>{s.full_name as string}</option>)}</Select>
                  </Field>
                  <Button variant="secondary" className="w-full">Зөвлөх томилох</Button>
                </form>
                <form action={assignAction.bind(null, id)} className="space-y-2">
                  <input type="hidden" name="role" value="reviewer" />
                  <Field label="Хянагч" name="reviewer">
                    <Select id="reviewer" name="userId" defaultValue=""><option value="">Сонгох…</option>{reviewers.map((s) => <option key={s.user_id as string} value={s.user_id as string}>{s.full_name as string}</option>)}</Select>
                  </Field>
                  <Button variant="secondary" className="w-full">Хянагч томилох</Button>
                </form>
              </>
            )}
          </Card>
          {!["draft", "awaiting_payment", "paid", "cancelled"].includes(status) && (
            <Card className="space-y-2">
              <h2 className="font-semibold">Тайлан</h2>
              <p className="text-sm text-muted">{latestReport ? `v${latestReport.version} · ${latestReport.status}` : "Эхлээгүй"}</p>
              <Link href={`/admin/orders/${id}/report`} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-5 text-sm font-semibold text-accent-ink">
                {isAdvisor && (!latestReport || ["draft", "revision_requested"].includes(latestReport.status as string)) ? "Тайлан бичих" : "Тайлан үзэх"}
              </Link>
            </Card>
          )}
          {isAdvisor && status === "in_progress" && (
            <Card>
              <h2 className="font-semibold">Харилцагчаас мэдээлэл хүсэх</h2>
              <form action={requestInfoAction.bind(null, id)} className="mt-3 space-y-3">
                <Textarea name="message" rows={3} required aria-label="Хүсэлт" placeholder="Жишээ: Өмчлөлийн гэрчилгээний 2 талын зургийг байршуулна уу." />
                <Button variant="secondary" className="w-full">Хүсэлт илгээх</Button>
              </form>
            </Card>
          )}
          {refundable.map((p) => (
            <Card key={p.id as string} className="space-y-3">
              <h2 className="font-semibold">Буцаалт · {formatMnt(p.amount_mnt as number)}</h2>
              <p className="text-xs text-muted">Банк/QPay-ээр буцаасны дараа энд бүртгэнэ. Төлөв: {PAYMENT_STATUS_LABEL[p.status as string]}</p>
              <form action={refundAction.bind(null, id, p.id as string)} className="space-y-2">
                <Input name="amount" inputMode="numeric" defaultValue={String(p.amount_mnt)} aria-label="Буцаах дүн" />
                <Textarea name="note" rows={2} required aria-label="Тайлбар" placeholder="Шалтгаан, гүйлгээний дугаар" />
                <div className="flex gap-2">
                  {p.status === "paid" && <Button name="status" value="refund_pending" variant="secondary" className="flex-1">Хүлээгдэж буй</Button>}
                  <Button name="status" value="refunded" className="flex-1">Буцаагдсан</Button>
                </div>
              </form>
            </Card>
          ))}
          {moves.length > 0 && (
            <Card>
              <h2 className="font-semibold">Төлөв өөрчлөх</h2>
              <form action={transitionAction.bind(null, id)} className="mt-3 space-y-3">
                <Field label="Шинэ төлөв" name="to">
                  <Select id="to" name="to">{moves.map((m) => <option key={m} value={m}>{ORDER_STATUS_LABEL[m]}</option>)}</Select>
                </Field>
                <Field label="Тайлбар" name="reason" hint="Цуцлахад заавал"><Textarea id="reason" name="reason" rows={2} /></Field>
                <Button className="w-full">Хадгалах</Button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
