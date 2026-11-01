import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { formatDate, formatMnt } from "@/lib/format";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/labels";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders/state-machine";

export const metadata = { title: "Захиалгууд" };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const access = await requireStaff("/admin/orders");
  const { status } = await searchParams;
  const filter = ORDER_STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : null;
  // RLS: admins see their branches; advisors/reviewers see only assigned orders.
  const rows = await asUser(access.user, (tx) => tx`
    select o.id, o.order_number, o.status, o.amount_mnt, o.created_at, s.name as service, b.name as branch,
           c.full_name as client, coalesce(nullif(p.title, ''), p.address) as property,
           (select pr.full_name from order_assignments a join profiles pr on pr.id = a.user_id
             where a.order_id = o.id and a.role = 'advisor' and a.is_active) as advisor
    from orders o join services s on s.id = o.service_id join branches b on b.id = o.branch_id
    left join profiles c on c.id = o.client_id left join properties p on p.id = o.property_id
    where (${filter}::order_status is null or o.status = ${filter}::order_status)
      and (o.status <> 'draft' or ${filter}::order_status = 'draft')
    order by o.created_at desc limit 200`);
  return (
    <>
      <PageHeader title="Захиалгууд" description="Ноорог захиалгыг зөвхөн шүүлтүүрээр харуулна." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/orders" className={`rounded-full border px-3 py-1 ${!filter ? "border-accent text-accent" : "border-line text-muted"}`}>Бүгд</Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={`/admin/orders?status=${s}`} className={`rounded-full border px-3 py-1 ${filter === s ? "border-accent text-accent" : "border-line text-muted"}`}>{ORDER_STATUS_LABEL[s]}</Link>
        ))}
      </div>
      {rows.length === 0 ? <EmptyState title="Захиалга алга" /> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>{["Дугаар", "Харилцагч", "Хөрөнгө", "Салбар", "Зөвлөх", "Дүн", "Огноо", "Төлөв"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id as string} className="hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium"><Link className="text-accent" href={`/admin/orders/${r.id}`}>{r.order_number as string}</Link></td>
                  <td className="px-4 py-3">{(r.client as string) || "—"}</td>
                  <td className="max-w-48 truncate px-4 py-3 text-muted">{(r.property as string) || "—"}</td>
                  <td className="px-4 py-3 text-muted">{r.branch as string}</td>
                  <td className="px-4 py-3">{(r.advisor as string) || <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMnt(r.amount_mnt as number | null)}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(r.created_at as string)}</td>
                  <td className="px-4 py-3"><Badge tone={ORDER_STATUS_TONE[r.status as OrderStatus]}>{ORDER_STATUS_LABEL[r.status as OrderStatus]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
