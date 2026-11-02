import Link from "next/link";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { markNotificationsReadAction } from "../orders/doc-actions";

export const metadata = { title: "Мэдэгдэл" };

export default async function NotificationsPage() {
  const access = await requireUser("/dashboard/notifications");
  const rows = await asUser(access.user, (tx) => tx`
    select id, title, body, link, read_at, created_at from notifications where user_id = ${access.user.id}
    order by created_at desc limit 100`);
  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <>
      <PageHeader title="Мэдэгдэл" actions={unread > 0 ? <form action={markNotificationsReadAction}><Button variant="secondary">Бүгдийг уншсан</Button></form> : undefined} />
      {rows.length === 0 ? <EmptyState title="Мэдэгдэл алга" /> : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map((n) => {
            const inner = (
              <>
                <p className={n.read_at ? "font-medium" : "font-semibold"}>{!n.read_at && <span aria-label="Шинэ" className="mr-2 inline-block size-2 rounded-full bg-accent" />}{n.title as string}</p>
                {n.body && <p className="text-sm text-muted">{n.body as string}</p>}
                <p className="mt-1 text-xs text-muted">{formatDate(n.created_at as string, true)}</p>
              </>
            );
            return (
              <li key={n.id as string}>
                {n.link && (n.link as string).startsWith("/") ? <Link href={n.link as string} className="block px-5 py-3 hover:bg-surface-2">{inner}</Link> : <div className="px-5 py-3">{inner}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
