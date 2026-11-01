import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Тайлан" };

export default async function ReportsPage() {
  const access = await requireUser("/dashboard/reports");
  // RLS returns only published versions to clients.
  const reports = await asUser(access.user, (tx) => tx`
    select r.id, r.report_number, r.version, r.published_at, o.id as order_id, o.order_number
    from reports r join orders o on o.id = r.order_id
    where o.client_id = ${access.user.id} and r.status = 'published' order by r.published_at desc`);
  return (
    <>
      <PageHeader title="Тайлан" description="Хянагдаж батлагдсан тайлангууд энд гарна." />
      {reports.length === 0 ? (
        <EmptyState title="Нийтлэгдсэн тайлан алга">Мэргэжилтэн тайланг бэлтгэж, өөр хянагч баталсны дараа энд харагдана.</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {reports.map((r) => (
            <li key={r.id as string} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <span className="font-medium">{r.report_number as string} · v{r.version as number}</span>
              <span className="text-muted"><Link className="text-accent" href={`/dashboard/orders/${r.order_id}`}>{r.order_number as string}</Link> · {formatDate(r.published_at as string)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
