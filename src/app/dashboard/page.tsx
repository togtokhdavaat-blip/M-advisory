import { OrderList } from "@/components/order-list";
import { ButtonLink, EmptyState, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { listMyOrders } from "@/lib/orders/queries";

export const metadata = { title: "Миний самбар" };

export default async function DashboardPage() {
  const access = await requireUser("/dashboard");
  const orders = await listMyOrders(access.user);
  const active = orders.filter((o) => !["completed", "cancelled", "draft"].includes(o.status));
  return (
    <>
      <PageHeader title={`Сайн байна уу, ${access.fullName.split(" ").at(-1) ?? ""}`} actions={<ButtonLink href="/order/m-check">Шинэ M CHECK</ButtonLink>} />
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Нийт захиалга" value={orders.length} />
        <Stat label="Идэвхтэй" value={active.length} />
        <Stat label="Ноорог" value={orders.filter((o) => o.status === "draft").length} />
        <Stat label="Дууссан" value={orders.filter((o) => o.status === "completed").length} />
      </div>
      <h2 className="mb-3 font-semibold">Сүүлийн захиалгууд</h2>
      {orders.length ? <OrderList orders={orders.slice(0, 5)} /> : (
        <EmptyState title="Захиалга алга" action={<ButtonLink href="/order/m-check">M CHECK захиалах</ButtonLink>}>
          Худалдан авахаар сонирхож буй хөрөнгөө шалгуулахын тулд M CHECK захиалаарай.
        </EmptyState>
      )}
    </>
  );
}
