import { SideNav } from "@/components/side-nav";
import { Container } from "@/components/ui";
import { requireStaff } from "@/lib/authz";
import { ROLE_LABEL } from "@/lib/labels";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await requireStaff("/admin");
  const isAdmin = access.isSuperAdmin || access.adminBranchIds.length > 0;
  const items = [
    { href: "/admin", label: "Тойм", exact: true },
    { href: "/admin/orders", label: "Захиалгууд" },
    { href: "/admin/reports", label: "Тайлан" },
    { href: "/dashboard/notifications", label: "Мэдэгдэл" },
    ...(isAdmin ? [
      { href: "/admin/payments", label: "Төлбөр" },
      { href: "/admin/clients", label: "Харилцагчид" },
      { href: "/admin/advisors", label: "Баг" },
    ] : []),
    ...(access.isSuperAdmin ? [
      { href: "/admin/services", label: "Үйлчилгээ" },
      { href: "/admin/pricing", label: "Үнэ" },
      { href: "/admin/settings", label: "Тохиргоо" },
    ] : []),
  ];
  const roles = [...access.roles].filter((r) => r !== "CLIENT").map((r) => ROLE_LABEL[r]).join(", ");
  return (
    <Container className="grid gap-8 py-8 lg:grid-cols-[220px_1fr] lg:py-12">
      <aside className="space-y-4">
        <div className="hidden lg:block">
          <p className="text-xs text-muted">{roles}</p>
          <p className="truncate font-semibold">{access.fullName}</p>
        </div>
        <SideNav label="Ажлын цэс" items={items} />
      </aside>
      <div className="min-w-0">{children}</div>
    </Container>
  );
}
