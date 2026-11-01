import { EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { formatDate, formatMnt } from "@/lib/format";

export const metadata = { title: "Харилцагчид" };

export default async function AdminClients() {
  const access = await requireAdmin("/admin/clients");
  // Clients of orders the admin can see (RLS on orders scopes branch admins).
  const rows = await asUser(access.user, (tx) => tx`
    select p.id, p.full_name, p.email, p.phone, count(o.id)::int as orders,
           coalesce(sum(o.amount_mnt) filter (where o.status not in ('draft','awaiting_payment','cancelled')), 0)::bigint as paid_mnt,
           max(o.created_at) as last_order
    from orders o join profiles p on p.id = o.client_id
    group by p.id, p.full_name, p.email, p.phone order by last_order desc limit 500`);
  return (
    <>
      <PageHeader title="Харилцагчид" />
      {rows.length === 0 ? <EmptyState title="Харилцагч алга" /> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted"><tr>{["Нэр", "Холбоо барих", "Захиалга", "Төлсөн", "Сүүлд"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id as string}>
                  <td className="px-4 py-3 font-medium">{(r.full_name as string) || "—"}</td>
                  <td className="px-4 py-3 text-muted">{r.email as string}{r.phone ? ` · ${r.phone}` : ""}</td>
                  <td className="px-4 py-3 tabular-nums">{r.orders as number}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMnt(r.paid_mnt as number)}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(r.last_order as string)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
