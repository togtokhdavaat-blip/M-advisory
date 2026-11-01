import { OrderList } from "@/components/order-list";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { listMyOrders } from "@/lib/orders/queries";

export const metadata = { title: "Захиалгууд" };

export default async function OrdersPage() {
  const access = await requireUser("/dashboard/orders");
  const orders = await listMyOrders(access.user);
  return (
    <>
      <PageHeader title="Захиалгууд" actions={<ButtonLink href="/order/m-check">Шинэ захиалга</ButtonLink>} />
      {orders.length ? <OrderList orders={orders} /> : <EmptyState title="Захиалга алга">Таны үүсгэсэн захиалгууд энд харагдана.</EmptyState>}
    </>
  );
}
