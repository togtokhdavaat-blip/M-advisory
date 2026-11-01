import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Баримт бичиг" };

export default async function DocumentsPage() {
  const access = await requireUser("/dashboard/documents");
  const docs = await asUser(access.user, (tx) => tx`
    select d.id, d.original_name, d.document_type, d.size_bytes, d.created_at, d.scan_status, o.id as order_id, o.order_number
    from documents d join orders o on o.id = d.order_id
    where o.client_id = ${access.user.id} order by d.created_at desc`);
  return (
    <>
      <PageHeader title="Баримт бичиг" description="Таны захиалгуудад байршуулсан баримтууд. Бүх файл хаалттай хадгалалтад байна." />
      {docs.length === 0 ? (
        <EmptyState title="Баримт алга">Захиалгынхаа хуудаснаас баримт байршуулна.</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {docs.map((d) => (
            <li key={d.id as string} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <span className="font-medium">{d.original_name as string}</span>
              <span className="text-muted">
                <Link className="text-accent" href={`/dashboard/orders/${d.order_id}`}>{d.order_number as string}</Link> · {formatDate(d.created_at as string)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
