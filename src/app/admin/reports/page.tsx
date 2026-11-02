import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { RISK_LABEL, type RiskLevel } from "@/lib/reports/schema";

export const metadata = { title: "Тайлан" };

const LABEL: Record<string, string> = { draft: "Ноорог", submitted: "Хяналтад", revision_requested: "Засвар хүссэн", approved: "Батлагдсан", published: "Нийтлэгдсэн" };
const TONE: Record<string, "neutral" | "accent" | "warn" | "good"> = { draft: "neutral", submitted: "accent", revision_requested: "warn", approved: "good", published: "good" };

export default async function AdminReports() {
  const access = await requireStaff("/admin/reports");
  // Latest version per order, scoped by RLS to the user's orders/branches.
  const rows = await asUser(access.user, (tx) => tx`
    select distinct on (r.order_id) r.id, r.order_id, r.version, r.status, r.overall_risk, r.updated_at, o.order_number, p.full_name as prepared
    from reports r join orders o on o.id = r.order_id left join profiles p on p.id = r.prepared_by
    order by r.order_id, r.version desc`);
  rows.sort((a, b) => (["submitted", "approved", "revision_requested", "draft", "published"].indexOf(a.status as string) - ["submitted", "approved", "revision_requested", "draft", "published"].indexOf(b.status as string)));
  return (
    <>
      <PageHeader title="Тайлан" description="Хяналт хүлээж буй тайлан эхэнд." />
      {rows.length === 0 ? <EmptyState title="Тайлан алга" /> : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map((r) => (
            <li key={r.id as string}>
              <Link href={`/admin/orders/${r.order_id}/report`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-surface-2">
                <span><b>{r.order_number as string}</b> · v{r.version as number} · {r.prepared as string}</span>
                <span className="flex items-center gap-2 text-muted">
                  {r.overall_risk && <span>{RISK_LABEL[r.overall_risk as RiskLevel]}</span>}
                  <span>{formatDate(r.updated_at as string)}</span>
                  <Badge tone={TONE[r.status as string]}>{LABEL[r.status as string]}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
