import { Card, PageHeader, Stat } from "@/components/ui";
import { adminMetrics } from "@/lib/admin/queries";
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
  const m = await adminMetrics(access.user);
  return (
    <>
      <PageHeader title="Ажлын самбар" description="Таны эрхийн хүрээнд харагдах захиалгын бодит тоо." />
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
