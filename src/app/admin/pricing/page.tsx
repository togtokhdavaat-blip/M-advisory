import { Alert, Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { formatMnt } from "@/lib/format";
import { approveAllProposedAction, revisePriceAction, setPriceStatusAction } from "../actions";

export const metadata = { title: "Үнэ" };

const STATUS: Record<string, { label: string; tone: "warn" | "good" | "neutral" }> = {
  proposed: { label: "Санал", tone: "warn" },
  approved: { label: "Батлагдсан", tone: "good" },
  retired: { label: "Хуучирсан", tone: "neutral" },
};

export default async function AdminPricing({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const access = await requireSuperAdmin("/admin/pricing");
  const sp = await searchParams;
  const { services, prices } = await asUser(access.user, async (tx) => ({
    services: await tx`select id, name from services order by sort_order`,
    prices: await tx`select * from service_prices where effective_to is null order by segment nulls first, value_min_mnt nulls first`,
  }));
  return (
    <>
      <PageHeader title="Үнийн жагсаалт" description="Бүх үнэ «Санал» төлөвтэй орсон. Зөвхөн батлагдсан үнээр захиалга хийгдэнэ. Захиалгад ашиглагдсан үнийг өөрчлөхөд шинэ хувилбар үүсэж, хуучин захиалгын үнэ хэвээр үлдэнэ." />
      <div className="mb-6 space-y-3">{sp.ok && <Alert tone="good">Хадгалагдлаа.</Alert>}{sp.error && <Alert tone="bad">{sp.error}</Alert>}</div>
      <div className="space-y-6">
        {services.map((s) => {
          const rows = prices.filter((p) => p.service_id === s.id);
          const proposed = rows.filter((p) => p.status === "proposed").length;
          return (
            <Card key={s.id as string}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">{s.name as string}</h2>
                {proposed > 0 && (
                  <form action={approveAllProposedAction.bind(null, s.id as string)}>
                    <Button variant="secondary">Бүх саналыг батлах ({proposed})</Button>
                  </form>
                )}
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs text-muted"><tr><th className="py-2 font-medium">Нөхцөл</th><th className="py-2 font-medium">Хөлс</th><th className="py-2 font-medium">Хувилбар</th><th className="py-2 font-medium">Төлөв</th><th className="py-2" /></tr></thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((p) => (
                      <tr key={p.id as string}>
                        <td className="py-2 pr-3">{p.label as string}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {p.pricing_model === "fixed" ? (
                            <form action={revisePriceAction.bind(null, p.id as string)} className="flex items-center gap-2">
                              <Input name="amount" defaultValue={String(p.amount_mnt)} inputMode="numeric" aria-label="Хөлс (₮)" className="min-h-9 w-32 py-1" />
                              <Button variant="ghost" className="min-h-9 px-3">Шинэчлэх</Button>
                            </form>
                          ) : p.pricing_model === "percentage" ? `${(Number(p.percent_bps) / 100).toFixed(2)}% (доод ${formatMnt(p.min_fee_mnt as number)})` : "Үнийн санал"}
                        </td>
                        <td className="py-2 pr-3 text-muted">v{p.version as number}</td>
                        <td className="py-2 pr-3"><Badge tone={STATUS[p.status as string].tone}>{STATUS[p.status as string].label}</Badge></td>
                        <td className="py-2 text-right">
                          {p.status === "proposed" && p.pricing_model !== "quote" && (
                            <form action={setPriceStatusAction.bind(null, p.id as string)}><input type="hidden" name="status" value="approved" /><Button variant="ghost" className="min-h-9 px-3">Батлах</Button></form>
                          )}
                          {p.status === "approved" && (
                            <form action={setPriceStatusAction.bind(null, p.id as string)}><input type="hidden" name="status" value="proposed" /><Button variant="ghost" className="min-h-9 px-3">Цуцлах</Button></form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
