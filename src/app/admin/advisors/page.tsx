import { Alert, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireAdmin } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/labels";
import { grantRoleAction, revokeRoleAction } from "../actions";

export const metadata = { title: "Баг" };

export default async function AdminTeam({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const access = await requireAdmin("/admin/advisors");
  const sp = await searchParams;
  const { members, branches } = await asUser(access.user, async (tx) => ({
    members: await tx`
      select m.id, m.role, m.branch_id, b.name as branch, p.full_name, p.email
      from memberships m join profiles p on p.id = m.user_id left join branches b on b.id = m.branch_id
      where m.is_active and m.role <> 'CLIENT' order by b.name nulls first, m.role, p.full_name`,
    branches: await tx`select id, name from branches where status = 'active' order by name`,
  }));
  const myBranches = access.isSuperAdmin ? branches : branches.filter((b) => access.adminBranchIds.includes(b.id as string));
  const roleOptions = access.isSuperAdmin ? ["ADVISOR", "REVIEWER", "BRANCH_ADMIN", "SUPER_ADMIN"] : ["ADVISOR", "REVIEWER"];
  return (
    <>
      <PageHeader title="Баг ба эрх" description="Ажилтан эхлээд өөрийн имэйлээр бүртгүүлсэн байх шаардлагатай." />
      <div className="mb-6 space-y-3">{sp.ok && <Alert tone="good">Хадгалагдлаа.</Alert>}{sp.error && <Alert tone="bad">{sp.error}</Alert>}</div>
      <Card className="mb-6">
        <h2 className="font-semibold">Эрх олгох</h2>
        <form action={grantRoleAction} className="mt-4 grid gap-4 sm:grid-cols-[1fr_180px_180px_auto] sm:items-end">
          <Field label="Имэйл" name="email"><Input id="email" name="email" type="email" required /></Field>
          <Field label="Эрх" name="role"><Select id="role" name="role">{roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
          <Field label="Салбар" name="branchId"><Select id="branchId" name="branchId">{myBranches.map((b) => <option key={b.id as string} value={b.id as string}>{b.name as string}</option>)}</Select></Field>
          <Button>Олгох</Button>
        </form>
      </Card>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-line text-xs text-muted"><tr><th className="px-4 py-3 font-medium">Нэр</th><th className="px-4 py-3 font-medium">Эрх</th><th className="px-4 py-3 font-medium">Салбар</th><th /></tr></thead>
          <tbody className="divide-y divide-line">
            {members.map((m) => (
              <tr key={m.id as string}>
                <td className="px-4 py-3">{m.full_name as string}<span className="block text-xs text-muted">{m.email as string}</span></td>
                <td className="px-4 py-3">{ROLE_LABEL[m.role as string]}</td>
                <td className="px-4 py-3 text-muted">{(m.branch as string) || "Бүх салбар"}</td>
                <td className="px-4 py-3 text-right">
                  <form action={revokeRoleAction.bind(null, m.id as string)}><Button variant="ghost" className="min-h-9 px-3 text-bad">Хасах</Button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
