import "server-only";
import type { SessionUser } from "../auth";
import { asUser } from "../db";
import type { OrderStatus } from "./state-machine";

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  serviceName: string;
  serviceSlug: string;
  propertyTitle: string;
  amountMnt: number | null;
  createdAt: string;
}

export async function listMyOrders(user: SessionUser): Promise<OrderSummary[]> {
  const rows = await asUser(user, (tx) => tx`
    select o.id, o.order_number, o.status, o.amount_mnt, o.created_at, s.name as service_name, s.slug as service_slug,
           coalesce(nullif(p.title, ''), p.address, '') as property_title
    from orders o
    join services s on s.id = o.service_id
    left join properties p on p.id = o.property_id
    where o.client_id = ${user.id}
    order by o.created_at desc`);
  return rows.map((r) => ({
    id: r.id as string,
    orderNumber: r.order_number as string,
    status: r.status as OrderStatus,
    serviceName: r.service_name as string,
    serviceSlug: r.service_slug as string,
    propertyTitle: r.property_title as string,
    amountMnt: (r.amount_mnt as number) ?? null,
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

export async function getOrderDetail(user: SessionUser, orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  return asUser(user, async (tx) => {
    const o = await tx`
      select o.*, s.name as service_name, s.slug as service_slug, s.code as service_code,
             s.terms_text as current_terms_text, s.terms_version as current_terms_version, b.name as branch_name
      from orders o join services s on s.id = o.service_id join branches b on b.id = o.branch_id
      where o.id = ${orderId}`;
    if (!o[0]) return null;
    const order = o[0];
    const [property, parties, history, payments, caps] = await Promise.all([
      tx`select * from properties where id = ${order.property_id}`,
      tx`select party_role, full_name, phone, email, is_client from order_parties where order_id = ${orderId} order by created_at`,
      tx`select h.from_status, h.to_status, h.reason, h.created_at, p.full_name as changed_by_name
         from order_status_history h left join profiles p on p.id = h.changed_by
         where h.order_id = ${orderId} order by h.created_at`,
      tx`select id, status, amount_mnt, provider, invoice_payload, expires_at, paid_at, created_at
         from payments where order_id = ${orderId} order by created_at desc`,
      tx`select app.order_actor_capacities(${orderId}::uuid) as caps`,
    ]);
    const [documents, reports, feedback, requirements] = await Promise.all([
      tx`select id, original_name, size_bytes, created_at, scan_status, is_internal from documents
         where order_id = ${orderId} and deleted_at is null order by created_at desc`,
      tx`select id, report_number, version, overall_risk, published_at from reports
         where order_id = ${orderId} and status = 'published' order by version desc`,
      tx`select rating, comment from order_feedback where order_id = ${orderId}`,
      tx`select code, label from service_requirements where service_id = ${order.service_id} order by sort_order`,
    ]);
    let quote: { amount: number | null; label: string } | null = null;
    if (order.status === "draft" && property[0]) {
      const q = await tx`
        select p.label, app.compute_amount(p, ${property[0].asking_price_mnt as number | null}) as amount
        from app.quote_price(${order.service_id}::uuid, ${property[0].property_type}::property_type, ${property[0].asking_price_mnt as number | null}) p
        where p.id is not null`;
      quote = q[0] ? { amount: (q[0].amount as number) ?? null, label: q[0].label as string } : null;
    }
    return {
      order,
      property: property[0] ?? null,
      parties,
      history,
      payments,
      capacities: (caps[0]?.caps as string[]) ?? [],
      quote,
      documents,
      reports,
      feedback: feedback[0] ?? null,
      requirements: requirements.map((r) => ({ code: r.code as string, label: r.label as string })),
    };
  });
}
