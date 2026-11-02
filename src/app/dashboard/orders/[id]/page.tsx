import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentsPanel, type DocRow } from "@/components/documents-panel";
import { Alert, Badge, Button, Card, Field, PageHeader, Textarea, cx } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { env } from "@/lib/env";
import { formatDate, formatMnt } from "@/lib/format";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PARTY_ROLE_LABEL, PAYMENT_STATUS_LABEL, PROPERTY_TYPE_LABEL, type PropertyType } from "@/lib/labels";
import { getOrderDetail } from "@/lib/orders/queries";
import { CLIENT_STEPS, type OrderStatus } from "@/lib/orders/state-machine";
import {
  cancelOrderAction, checkPaymentAction, mockPayAction, reopenDraftAction, startPaymentAction, submitOrderAction,
} from "../actions";
import { feedbackAction, infoProvidedAction } from "../doc-actions";
import { RISK_LABEL, type RiskLevel } from "@/lib/reports/schema";

export const metadata = { title: "Захиалга" };

type SP = Promise<Record<string, string | undefined>>;

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const access = await requireUser(`/dashboard/orders/${id}`);
  const d = await getOrderDetail(access.user, id);
  if (!d || d.order.client_id !== access.user.id) notFound();

  const { order, property, parties, history, payments, quote, documents, reports, feedback, requirements } = d;
  const infoRequest = [...history].reverse().find((h) => h.to_status === "needs_information");
  const status = order.status as OrderStatus;
  const pending = payments.find((p) => p.status === "pending");
  const paid = payments.find((p) => p.status === "paid");
  const stepIndex = CLIENT_STEPS.findIndex((s) => s.statuses.includes(status));
  const isMock = env().PAYMENT_PROVIDER === "mock";
  const payload = (pending?.invoice_payload ?? null) as { qrText?: string; qrImage?: string; shortUrl?: string; urls?: { name: string; link: string; logo?: string }[] } | null;

  return (
    <>
      <PageHeader
        eyebrow={`${order.service_name as string} · ${order.order_number as string}`}
        title={(property?.title as string) || "Захиалга"}
        actions={<Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>}
      />

      <div className="mb-6 space-y-3">
        {sp.saved && status === "draft" && <Alert tone="good" title="Захиалга хадгалагдлаа">Мэдээллээ шалгаад нөхцөлийг зөвшөөрч илгээнэ үү.</Alert>}
        {sp.submitted && <Alert tone="good" title="Захиалга баталгаажлаа">Одоо төлбөрөө төлснөөр ажил эхэлнэ.</Alert>}
        {sp.paid && <Alert tone="good" title="Төлбөр баталгаажлаа">Таны захиалгад мэргэжилтэн удахгүй хуваарилагдана.</Alert>}
        {sp.pending && <Alert tone="warn">Төлбөр хараахан орж ирээгүй байна. Төлсний дараа дахин шалгана уу.</Alert>}
        {sp.cancelled && <Alert tone="neutral">Захиалга цуцлагдлаа.</Alert>}
        {sp.uploaded && <Alert tone="good">Файл байршлаа.</Alert>}
        {sp.info && <Alert tone="good">Мэдээлэл илгээгдлээ. Зөвлөх ажлаа үргэлжлүүлнэ.</Alert>}
        {sp.thanks && <Alert tone="good">Үнэлгээ өгсөнд баярлалаа.</Alert>}
        {sp.error && <Alert tone="bad">{sp.error}</Alert>}
        {status === "needs_information" && (
          <Alert tone="warn" title="Зөвлөхөөс нэмэлт мэдээлэл хүсэж байна">
            <p className="whitespace-pre-line">{(infoRequest?.reason as string) ?? ""}</p>
            <form action={infoProvidedAction.bind(null, id)} className="mt-3 space-y-2">
              <Textarea name="note" rows={2} aria-label="Хариу" placeholder="Хариу эсвэл тайлбар (файлаа доорх хэсгээс байршуулна)" />
              <Button>Мэдээлэл илгээсэн</Button>
            </form>
          </Alert>
        )}
      </div>

      {status !== "cancelled" && (
        <ol className="mb-8 grid grid-cols-5 gap-2" aria-label="Захиалгын явц">
          {CLIENT_STEPS.map((s, i) => (
            <li key={s.key} className="min-w-0" aria-current={i === stepIndex ? "step" : undefined}>
              <div className={cx("h-1.5 rounded-full", i <= stepIndex ? "bg-accent" : "bg-line")} />
              <p className={cx("mt-2 truncate text-xs", i === stepIndex ? "font-semibold text-ink" : "text-muted")}>{s.label}</p>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {property && (
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Хөрөнгө</h2>
                {status === "draft" && <Link href={`/order/${order.service_slug}?edit=${order.id}`} className="text-sm font-semibold text-accent">Засах</Link>}
              </div>
              <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Item k="Төрөл" v={PROPERTY_TYPE_LABEL[property.property_type as PropertyType]} />
                <Item k="Байршил" v={[property.district, property.khoroo].filter(Boolean).join(", ")} />
                <Item k="Хаяг" v={property.address as string} wide />
                <Item k="Талбай" v={property.area_sqm ? `${property.area_sqm} м²` : null} />
                <Item k="Өрөө / давхар" v={[property.rooms, property.floor].filter((x) => x !== null).join(" / ")} />
                <Item k="Зарагдаж буй үнэ" v={formatMnt(property.asking_price_mnt as number | null)} />
                <Item k="Улсын бүртгэлийн дугаар" v={property.registration_number as string} />
              </dl>
            </Card>
          )}

          {parties.length > 0 && (
            <Card>
              <h2 className="font-semibold">Холбогдох талууд</h2>
              <ul className="mt-3 divide-y divide-line text-sm">
                {parties.map((p, i) => (
                  <li key={i} className="flex justify-between py-2">
                    <span className="text-muted">{PARTY_ROLE_LABEL[p.party_role as string]}</span>
                    <span>{p.full_name as string}{p.is_client ? " (та)" : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <DocumentsPanel orderId={id} back={`/dashboard/orders/${id}`} docs={documents as unknown as DocRow[]} requirements={requirements}
            canUpload={!["completed", "cancelled"].includes(status)} />

          <Card>
            <h2 className="font-semibold">Түүх</h2>
            <ol className="mt-4 space-y-3 border-l border-line pl-5 text-sm">
              {history.map((h, i) => (
                <li key={i} className="relative">
                  <span aria-hidden className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-accent" />
                  <p className="font-medium">{ORDER_STATUS_LABEL[h.to_status as OrderStatus]}</p>
                  <p className="text-xs text-muted">{formatDate(h.created_at as string, true)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          {status === "draft" && (
            <Card className="space-y-4">
              <h2 className="font-semibold">Хөлс ба нөхцөл</h2>
              {quote?.amount ? (
                <div>
                  <p className="font-display text-2xl font-semibold tabular-nums">{formatMnt(quote.amount)}</p>
                  <p className="text-xs text-muted">{quote.label} · НӨАТ орсон</p>
                </div>
              ) : (
                <Alert tone="warn">Энэ төрлийн хөрөнгийн үнэ хараахан батлагдаагүй байна. Захиалгаа хадгалсан тул бид тантай холбогдоно.</Alert>
              )}
              <details className="rounded-lg border border-line bg-surface-2 p-3 text-xs text-muted">
                <summary className="cursor-pointer font-semibold text-ink">Үйлчилгээний нөхцөл ({order.current_terms_version as string})</summary>
                <p className="mt-2 whitespace-pre-line">{order.current_terms_text as string}</p>
              </details>
              <form action={submitOrderAction.bind(null, id)} className="space-y-4">
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" name="acceptTerms" required className="mt-1 size-4 accent-[var(--accent)]" />
                  Үйлчилгээний нөхцөлийг уншиж зөвшөөрч байна.
                </label>
                <Button type="submit" className="w-full" disabled={!quote?.amount}>Захиалга баталгаажуулах</Button>
              </form>
              <form action={cancelOrderAction.bind(null, id)}>
                <Button variant="ghost" className="w-full">Ноорог устгах</Button>
              </form>
            </Card>
          )}

          {status === "awaiting_payment" && (
            <Card className="space-y-4">
              <h2 className="font-semibold">Төлбөр</h2>
              <div>
                <p className="font-display text-2xl font-semibold tabular-nums">{formatMnt(order.amount_mnt as number)}</p>
                <p className="text-xs text-muted">Симкас Пропертиз ХХК · НӨАТ орсон · Үнэ {formatDate(order.submitted_at as string)}-нд тогтсон</p>
              </div>
              {pending ? (
                <>
                  {payload?.qrImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`data:image/png;base64,${payload.qrImage}`} alt="QPay QR код" className="mx-auto size-48 rounded-lg bg-white p-2" />
                  )}
                  {payload?.urls && payload.urls.length > 0 && (
                    <ul className="grid grid-cols-2 gap-2 text-sm">
                      {payload.urls.map((u) => (
                        <li key={u.name}><a href={u.link} className="block rounded-lg border border-line px-3 py-2 text-center hover:bg-surface-2">{u.name}</a></li>
                      ))}
                    </ul>
                  )}
                  {isMock && (
                    <div className="space-y-2 rounded-lg border border-dashed border-warn p-3">
                      <p className="text-xs font-semibold text-warn">ТУРШИЛТЫН ОРЧИН — жинхэнэ төлбөр биш</p>
                      <form action={mockPayAction.bind(null, id, pending.id as string)}>
                        <Button variant="secondary" className="w-full">Туршилтын төлбөр хийх</Button>
                      </form>
                    </div>
                  )}
                  <form action={checkPaymentAction.bind(null, id, pending.id as string)}>
                    <Button className="w-full">Төлбөр шалгах</Button>
                  </form>
                  <p className="text-xs text-muted">Нэхэмжлэл {formatDate(pending.expires_at as string, true)} хүртэл хүчинтэй.</p>
                </>
              ) : (
                <form action={startPaymentAction.bind(null, id)}>
                  <Button className="w-full">QPay-ээр төлөх</Button>
                </form>
              )}
              {!pending && (
                <div className="flex gap-2">
                  <form action={reopenDraftAction.bind(null, id)} className="flex-1"><Button variant="ghost" className="w-full">Засах</Button></form>
                  <form action={cancelOrderAction.bind(null, id)} className="flex-1"><Button variant="ghost" className="w-full">Цуцлах</Button></form>
                </div>
              )}
            </Card>
          )}

          {!["draft", "awaiting_payment", "cancelled"].includes(status) && (
            <Card className="space-y-3">
              <h2 className="font-semibold">Төлбөр</h2>
              <p className="font-display text-xl font-semibold tabular-nums">{formatMnt(order.amount_mnt as number)}</p>
              {paid && <Badge tone="good">{PAYMENT_STATUS_LABEL.paid} · {formatDate(paid.paid_at as string, true)}</Badge>}
              <p className="text-sm text-muted">
                {status === "completed" ? "Тайлан бэлэн боллоо." : "Таны захиалга дээр мэргэжилтэн ажиллаж байна. Төлөв өөрчлөгдөх бүрт энд мэдэгдэнэ."}
              </p>
            </Card>
          )}

          {reports.length > 0 && (
            <Card className="space-y-3">
              <h2 className="font-semibold">Тайлан</h2>
              {reports.map((r) => (
                <div key={r.id as string} className="space-y-1">
                  <p className="text-sm">{r.report_number as string} · v{r.version as number} · {formatDate(r.published_at as string)}</p>
                  <p className="text-sm">Нийт эрсдэл: <b>{RISK_LABEL[r.overall_risk as RiskLevel]}</b></p>
                  <a href={`/api/reports/${r.id}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-5 text-sm font-semibold text-accent-ink">PDF татах</a>
                </div>
              ))}
            </Card>
          )}

          {status === "completed" && (
            <Card className="space-y-3">
              <h2 className="font-semibold">Үйлчилгээг үнэлэх</h2>
              {feedback ? (
                <p className="text-sm">Таны үнэлгээ: {"★".repeat(feedback.rating as number)}{"☆".repeat(5 - (feedback.rating as number))}</p>
              ) : (
                <form action={feedbackAction.bind(null, id)} className="space-y-3">
                  <fieldset className="flex gap-2" aria-label="Үнэлгээ">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} className="flex flex-col items-center text-xs">
                        <input type="radio" name="rating" value={n} required className="size-4" />{n}
                      </label>
                    ))}
                  </fieldset>
                  <Field label="Сэтгэгдэл" name="comment"><Textarea id="comment" name="comment" rows={3} /></Field>
                  <Button className="w-full">Илгээх</Button>
                </form>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Item({ k, v, wide }: { k: string; v: unknown; wide?: boolean }) {
  const text = v === null || v === undefined || v === "" ? "—" : String(v);
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="mt-0.5">{text}</dd>
    </div>
  );
}
