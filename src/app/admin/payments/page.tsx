import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { formatDate, formatMnt } from "@/lib/format";
import { PAYMENT_STATUS_LABEL } from "@/lib/labels";

export const metadata = { title: "Төлбөр" };

const TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = { paid: "good", pending: "warn", failed: "bad", expired: "neutral", cancelled: "neutral", refund_pending: "warn", refunded: "neutral" };

export default async function AdminPayments() {
  const access = await requireAdmin("/admin/payments");
  const rows = await asUser(access.user, (tx) => tx`
    select p.id, p.status, p.amount_mnt, p.provider, p.provider_invoice_id, p.created_at, p.paid_at, p.failure_reason, o.id as order_id, o.order_number
    from payments p join orders o on o.id = p.order_id order by p.created_at desc limit 300`);
  return (
    <>
      <PageHeader title="Төлбөр" description="Нэхэмжлэл бүр QPay-ээс сервер талд баталгаажсаны дараа л «Төлөгдсөн» болно." />
      {rows.length === 0 ? <EmptyState title="Төлбөр алга" /> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted"><tr>{["Захиалга", "Дүн", "Систем", "Нэхэмжлэл", "Үүссэн", "Төлсөн", "Төлөв"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id as string}>
                  <td className="px-4 py-3"><Link className="text-accent" href={`/admin/orders/${r.order_id}`}>{r.order_number as string}</Link></td>
                  <td className="px-4 py-3 tabular-nums">{formatMnt(r.amount_mnt as number)}</td>
                  <td className="px-4 py-3">{r.provider as string}</td>
                  <td className="max-w-40 truncate px-4 py-3 font-mono text-xs text-muted">{(r.provider_invoice_id as string) || "—"}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(r.created_at as string, true)}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(r.paid_at as string, true)}</td>
                  <td className="px-4 py-3"><Badge tone={TONE[r.status as string]}>{PAYMENT_STATUS_LABEL[r.status as string]}</Badge>{r.failure_reason ? <span className="block text-xs text-bad">{r.failure_reason as string}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
