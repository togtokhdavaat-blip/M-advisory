import Link from "next/link";
import { formatDate, formatMnt } from "@/lib/format";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/labels";
import type { OrderSummary } from "@/lib/orders/queries";
import { Badge } from "./ui";

export function OrderList({ orders }: { orders: OrderSummary[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/dashboard/orders/${o.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold">{o.serviceName} <span className="font-normal text-muted">· {o.orderNumber}</span></p>
              <p className="truncate text-sm text-muted">{o.propertyTitle || "—"}</p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="tabular-nums text-muted">{formatMnt(o.amountMnt)}</span>
              <span className="text-muted">{formatDate(o.createdAt)}</span>
              <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
