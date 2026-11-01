import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";
import { listServices } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Үйлчилгээ" };

export default async function ServicesPage() {
  const services = await listServices();
  return (
    <Container className="py-12">
      <PageHeader eyebrow="Үйлчилгээний каталог" title="Үйлчилгээ" description="Эхний ээлжинд M CHECK онлайнаар бүрэн захиалагдана. Бусад үйлчилгээг удахгүй нээнэ." />
      <div className="grid gap-4">
        {services.map((s) => (
          <Link key={s.id} href={`/services/${s.slug}`} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-6 hover:border-accent sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-lg font-semibold">{s.name}</p>
              <p className="text-muted">{s.tagline}</p>
            </div>
            <span className="text-sm font-semibold text-accent">{s.isOrderable ? "Захиалах →" : "Дэлгэрэнгүй →"}</span>
          </Link>
        ))}
      </div>
    </Container>
  );
}
