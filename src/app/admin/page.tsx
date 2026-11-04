import Link from "next/link";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { adminMetrics, myWork } from "@/lib/admin/queries";
import { FINAL_LABEL } from "@/lib/checklists/m-check";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/labels";
import type { OrderStatus } from "@/lib/orders/state-machine";
import { requireStaff } from "@/lib/authz";
import { formatMnt } from "@/lib/format";

export const metadata = { title: "Ажлын самбар" };

function Bars({ rows }: { rows: { name: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="mt-4 space-y-3 text-sm">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex justify-between"><span>{r.name}</span><span className="tabular-nums text-muted">{r.n}</span></div>
          <div className="mt-1 h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full bg-accent" style={{ width: `${(r.n / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminHome() {
  const access = await requireStaff();
  const [m, work] = await Promise.all([adminMetrics(access.user), myWork(access.user)]);
  return (
    <>
      <PageHeader title="Ажлын самбар" description="Таны эрхийн хүрээнд харагдах захиалгын бодит тоо." />
      {work.length > 0 && (
        <Card className="mb-6">
          <h2 className="font-semibold">Миний ажил</h2>
          <p className="mt-1 text-sm text-muted">Танд хуваарилагдсан, дуусаагүй захиалгууд. Зөвлөх шалгах жагсаалтаа бөглөж, тайлангаа үүсгэнэ. Хянагч илгээсэн тайланг батална.</p>
          <ul className="mt-4 divide-y divide-line">
            {work.map((w) => (
              <li key={`${w.id}-${w.role}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{w.orderNumber} · {w.service} <span className="font-normal text-muted">({w.role === "advisor" ? "зөвлөх" : "хянагч"})</span></p>
                  <p className="truncate text-xs text-muted">{w.address || "Хаяг оруулаагүй"}</p>
                  {w.progress && (
                    <p className="mt-1 text-xs">Жагсаалт: {w.progress.done}/{w.progress.total} · {FINAL_LABEL[w.progress.verdict]}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={ORDER_STATUS_TONE[w.status as OrderStatus]}>{ORDER_STATUS_LABEL[w.status as OrderStatus]}</Badge>
                  <Link className="text-sm font-semibold text-accent" href={`/admin/orders/${w.id}/report`}>
                    {w.role === "reviewer" ? "Хянах →" : w.progress ? "Үргэлжлүүлэх →" : "Шалгалт эхлэх →"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Нийт захиалга" value={m.total} />
        <Stat label="Төлөгдсөн" value={m.paid} />
        <Stat label="Гүйцэтгэж буй" value={m.inProgress} />
        <Stat label="Дууссан" value={m.completed} />
        <Stat label="Нийт орлого" value={formatMnt(m.grossMnt)} hint="Буцаалтыг хассан" />
        <Stat label="Төлөгдөөгүй" value={formatMnt(m.outstandingMnt)} hint={`${m.awaitingPayment} захиалга`} />
        <Stat label="Дундаж гүйцэтгэх хугацаа" value={m.avgHours === null ? "—" : `${m.avgHours.toFixed(1)} цаг`} hint="Төлбөрөөс дуусах хүртэл" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card><h2 className="font-semibold">Салбараар</h2><Bars rows={m.byBranch} /></Card>
        <Card><h2 className="font-semibold">Үйлчилгээгээр</h2><Bars rows={m.byService} /></Card>
        <Card>
          <h2 className="font-semibold">Ажлын ачаалал</h2>
          {m.workload.length ? <Bars rows={m.workload.map((w) => ({ name: `${w.name} (${w.role === "advisor" ? "зөвлөх" : "хянагч"})`, n: w.n }))} /> : <p className="mt-4 text-sm text-muted">Идэвхтэй хуваарилалт алга.</p>}
        </Card>
      </div>
    </>
  );
}
