import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportEditor } from "@/components/report-editor";
import { Alert, Badge, Button, Card, Field, PageHeader, Textarea } from "@/components/ui";
import { requireStaff } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { formatDate, formatMnt } from "@/lib/format";
import { PROPERTY_TYPE_LABEL, type PropertyType } from "@/lib/labels";
import type { Actor } from "@/lib/orders/state-machine";
import { RISK_LABEL, emptyReport, reportContentSchema, type ReportContent, type RiskLevel } from "@/lib/reports/schema";
import { publishReportAction, reviewReportAction, saveReportAction } from "../../../actions";

export const metadata = { title: "Тайлан" };

const STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "warn" | "good" }> = {
  draft: { label: "Ноорог", tone: "neutral" },
  submitted: { label: "Хяналтад", tone: "accent" },
  revision_requested: { label: "Засвар хүссэн", tone: "warn" },
  approved: { label: "Батлагдсан", tone: "good" },
  published: { label: "Нийтлэгдсэн", tone: "good" },
};

const OK: Record<string, string> = {
  saved: "Ноорог хадгалагдлаа.",
  submitted: "Тайлан хянагч руу илгээгдлээ.",
  approved: "Тайлан батлагдаж, PDF үүсч харилцагчид нийтлэгдлээ.",
  revision_requested: "Засвар хүсэлт зөвлөх рүү илгээгдлээ.",
};

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const access = await requireStaff(`/admin/orders/${id}/report`);
  const data = await asUser(access.user, async (tx) => {
    const o = (await tx`
      select o.*, p.property_type, p.address, p.district, p.khoroo, p.area_sqm, p.asking_price_mnt, p.registration_number,
             p.rooms, p.floor, p.build_year, c.full_name as client_name
      from orders o left join properties p on p.id = o.property_id left join profiles c on c.id = o.client_id where o.id = ${id}`)[0];
    if (!o) return null;
    const [reports, reviews, caps] = await Promise.all([
      tx`select r.*, pp.full_name as prepared_name, ap.full_name as approved_name from reports r
         left join profiles pp on pp.id = r.prepared_by left join profiles ap on ap.id = r.approved_by
         where r.order_id = ${id} order by r.version desc`,
      tx`select rv.*, p.full_name as reviewer_name, r.version from report_reviews rv join reports r on r.id = rv.report_id
         left join profiles p on p.id = rv.reviewer_id where r.order_id = ${id} order by rv.created_at desc`,
      tx`select app.order_actor_capacities(${id}::uuid) as caps`,
    ]);
    return { o, reports, reviews, caps: (caps[0].caps as Actor[]) ?? [] };
  });
  if (!data) notFound();
  const { o, reports, reviews, caps } = data;
  const latest = reports[0];
  const isAdvisor = caps.includes("advisor");
  const isReviewer = caps.includes("reviewer");
  const isAdmin = caps.includes("admin");

  const canEdit = isAdvisor && ["assigned", "in_progress", "needs_information", "revision_requested"].includes(o.status as string)
    && (!latest || ["draft", "revision_requested"].includes(latest.status as string));

  let content: ReportContent;
  if (latest) content = reportContentSchema.parse(latest.content);
  else {
    content = emptyReport();
    content.property_info = [
      `Төрөл: ${PROPERTY_TYPE_LABEL[o.property_type as PropertyType] ?? "—"}`,
      `Хаяг: ${[o.district, o.khoroo, o.address].filter(Boolean).join(", ")}`,
      o.area_sqm ? `Талбай: ${o.area_sqm} м²` : "",
      o.rooms ? `Өрөө: ${o.rooms}` : "",
      o.build_year ? `Ашиглалтад орсон: ${o.build_year}` : "",
      o.asking_price_mnt ? `Зарагдаж буй үнэ: ${formatMnt(o.asking_price_mnt as number)}` : "",
      o.registration_number ? `Улсын бүртгэлийн дугаар: ${o.registration_number}` : "",
    ].filter(Boolean).join("\n");
  }

  return (
    <>
      <PageHeader eyebrow={`${o.order_number as string} · ${(o.client_name as string) ?? ""}`} title="M CHECK тайлан"
        description={<Link href={`/admin/orders/${id}`} className="text-accent">← Захиалга руу буцах</Link>}
        actions={latest ? <Badge tone={STATUS[latest.status as string].tone}>v{latest.version as number} · {STATUS[latest.status as string].label}</Badge> : undefined} />
      <div className="mb-6 space-y-3">
        {sp.ok && OK[sp.ok] && <Alert tone="good">{OK[sp.ok]}</Alert>}
        {sp.error && <Alert tone="bad">{sp.error}</Alert>}
        {latest?.status === "revision_requested" && reviews[0] && (
          <Alert tone="warn" title={`Хянагчийн засварын хүсэлт (${reviews[0].reviewer_name as string})`}><p className="whitespace-pre-line">{reviews[0].comments as string}</p></Alert>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div>
          {canEdit ? (
            <ReportEditor initial={content} action={saveReportAction.bind(null, id)} />
          ) : latest ? (
            <ReportEditor initial={content} action={saveReportAction.bind(null, id)} readOnly />
          ) : (
            <Alert tone="neutral">Тайлан хараахан эхлээгүй. Зөвхөн томилогдсон зөвлөх тайлан бичнэ.</Alert>
          )}
        </div>
        <div className="space-y-6">
          {latest?.status === "submitted" && isReviewer && latest.prepared_by !== access.user.id && (
            <Card className="space-y-3">
              <h2 className="font-semibold">Хяналт</h2>
              <p className="text-sm text-muted">Батлахад PDF автоматаар үүсч, харилцагчид нийтлэгдэн захиалга дуусна.</p>
              <form action={reviewReportAction.bind(null, id, latest.id as string)} className="space-y-3">
                <Field label="Тайлбар" name="comments" hint="Засвар хүсэхэд заавал"><Textarea id="comments" name="comments" rows={4} /></Field>
                <Button name="decision" value="approved" className="w-full">Батлах ба нийтлэх</Button>
                <Button name="decision" value="revision_requested" variant="secondary" className="w-full">Засвар хүсэх</Button>
              </form>
            </Card>
          )}
          {latest?.status === "approved" && (isReviewer || isAdmin) && (
            <Card className="space-y-3">
              <Alert tone="warn">Тайлан батлагдсан боловч нийтлэгдээгүй байна.</Alert>
              <form action={publishReportAction.bind(null, id, latest.id as string)}><Button className="w-full">PDF үүсгэж нийтлэх</Button></form>
            </Card>
          )}
          {latest?.status === "published" && (
            <Card className="space-y-2">
              <h2 className="font-semibold">Нийтлэгдсэн</h2>
              <p className="text-sm text-muted">{formatDate(latest.published_at as string, true)} · Баталсан: {latest.approved_name as string}</p>
              <p className="text-sm">Нийт эрсдэл: <b>{RISK_LABEL[latest.overall_risk as RiskLevel]}</b></p>
              <a className="inline-block text-sm font-semibold text-accent" href={`/api/reports/${latest.id}`}>PDF татах</a>
            </Card>
          )}
          <Card>
            <h2 className="font-semibold">Хувилбарууд</h2>
            <ul className="mt-3 divide-y divide-line text-sm">
              {reports.map((r) => (
                <li key={r.id as string} className="py-2">
                  v{r.version as number} · {STATUS[r.status as string].label}
                  <span className="block text-xs text-muted">{r.prepared_name as string} · {formatDate(r.updated_at as string, true)}</span>
                </li>
              ))}
              {reports.length === 0 && <li className="py-2 text-muted">Алга</li>}
            </ul>
          </Card>
          {reviews.length > 0 && (
            <Card>
              <h2 className="font-semibold">Хяналтын түүх</h2>
              <ul className="mt-3 divide-y divide-line text-sm">
                {reviews.map((r) => (
                  <li key={r.id as string} className="py-2">
                    v{r.version as number} · {r.decision === "approved" ? "Батлагдсан" : "Засвар хүссэн"} · {r.reviewer_name as string}
                    {r.comments && <span className="block whitespace-pre-line text-xs text-muted">{r.comments as string}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
