import { SideNav } from "@/components/side-nav";
import { Container } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { logoutAction } from "../login/actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const access = await requireUser("/dashboard");
  return (
    <Container className="grid gap-8 py-8 lg:grid-cols-[220px_1fr] lg:py-12">
      <aside className="space-y-4">
        <div className="hidden lg:block">
          <p className="text-xs text-muted">Нэвтэрсэн</p>
          <p className="truncate font-semibold">{access.fullName}</p>
        </div>
        <SideNav label="Харилцагчийн цэс" items={[
          { href: "/dashboard", label: "Тойм", exact: true },
          { href: "/dashboard/orders", label: "Захиалгууд" },
          { href: "/dashboard/documents", label: "Баримт бичиг" },
          { href: "/dashboard/reports", label: "Тайлан" },
          { href: "/dashboard/notifications", label: "Мэдэгдэл" },
          { href: "/account", label: "Бүртгэл" },
        ]} />
        <form action={logoutAction} className="hidden lg:block">
          <button className="px-3 text-sm text-muted hover:text-ink">Гарах</button>
        </form>
      </aside>
      <div className="min-w-0">{children}</div>
    </Container>
  );
}
