import "server-only";
import type { SessionUser } from "../auth";
import { asUser } from "../db";

/** Dashboard metrics. Runs under the user's RLS, so branch admins see only their branches. */
export async function adminMetrics(user: SessionUser) {
  return asUser(user, async (tx) => {
    const [totals] = await tx`
      select count(*)::int as total,
             count(*) filter (where status not in ('draft','awaiting_payment','cancelled'))::int as paid,
             count(*) filter (where status in ('assigned','in_progress','needs_information','under_review','revision_requested'))::int as in_progress,
             count(*) filter (where status = 'completed')::int as completed,
             count(*) filter (where status = 'awaiting_payment')::int as awaiting_payment,
             coalesce(sum(amount_mnt) filter (where status = 'awaiting_payment'), 0)::bigint as outstanding_mnt,
             avg(extract(epoch from (completed_at - paid_at)) / 3600) filter (where completed_at is not null and paid_at is not null) as avg_hours
      from orders`;
    const [revenue] = await tx`
      select coalesce(sum(p.amount_mnt - p.refunded_amount_mnt), 0)::bigint as gross
      from payments p where p.status in ('paid', 'refund_pending', 'refunded')`;
    const byBranch = await tx`
      select b.name, count(o.id)::int as n from branches b left join orders o on o.branch_id = b.id
      group by b.id, b.name order by b.name`;
    const byService = await tx`
      select s.name, count(o.id)::int as n from services s left join orders o on o.service_id = s.id
      group by s.id, s.name, s.sort_order order by s.sort_order`;
    const workload = await tx`
      select p.full_name, a.role, count(*)::int as n
      from order_assignments a join orders o on o.id = a.order_id join profiles p on p.id = a.user_id
      where a.is_active and o.status not in ('completed', 'cancelled')
      group by p.full_name, a.role order by n desc limit 10`;
    return {
      total: totals.total as number,
      paid: totals.paid as number,
      inProgress: totals.in_progress as number,
      completed: totals.completed as number,
      awaitingPayment: totals.awaiting_payment as number,
      outstandingMnt: totals.outstanding_mnt as number,
      avgHours: totals.avg_hours === null ? null : Number(totals.avg_hours),
      grossMnt: revenue.gross as number,
      byBranch: byBranch.map((r) => ({ name: r.name as string, n: r.n as number })),
      byService: byService.map((r) => ({ name: r.name as string, n: r.n as number })),
      workload: workload.map((r) => ({ name: r.full_name as string, role: r.role as string, n: r.n as number })),
    };
  });
}
