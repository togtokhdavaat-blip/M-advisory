import { ProfileForm } from "@/components/profile-form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { logoutAction } from "../login/actions";

export const metadata = { title: "Бүртгэл" };

export default async function AccountPage() {
  const access = await requireUser("/account");
  const { profile, consents } = await asUser(access.user, async (tx) => ({
    profile: (await tx`select full_name, phone, email from profiles where id = ${access.user.id}`)[0],
    consents: await tx`select consent_type, version, granted_at from consents where user_id = ${access.user.id} and withdrawn_at is null order by granted_at desc limit 20`,
  }));
  return (
    <>
      <PageHeader title="Бүртгэл" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><ProfileForm fullName={(profile?.full_name as string) ?? ""} phone={(profile?.phone as string) ?? ""} email={(profile?.email as string) ?? ""} /></Card>
        <div className="space-y-6">
          <Card>
            <h2 className="font-semibold">Эрх</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {access.memberships.map((m) => <li key={m.id}>{ROLE_LABEL[m.role]}{m.branchName ? ` · ${m.branchName}` : ""}</li>)}
            </ul>
          </Card>
          <Card>
            <h2 className="font-semibold">Зөвшөөрлүүд</h2>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {consents.map((c, i) => <li key={i}>{c.consent_type as string} · {c.version as string} · {formatDate(c.granted_at as string)}</li>)}
            </ul>
          </Card>
          <form action={logoutAction}><button className="text-sm font-semibold text-bad">Системээс гарах</button></form>
        </div>
      </div>
    </>
  );
}
