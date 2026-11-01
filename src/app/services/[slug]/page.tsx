import { notFound } from "next/navigation";
import { Alert, ButtonLink, Card, Container, PageHeader } from "@/components/ui";
import { getServiceBySlug, priceRange } from "@/lib/catalog";
import { formatMnt } from "@/lib/format";
import { PROPERTY_TYPE_LABEL, type PropertyType } from "@/lib/labels";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const data = await getServiceBySlug((await params).slug);
  return { title: data?.service.name ?? "Үйлчилгээ" };
}

function band(min: number | null, max: number | null) {
  if (min === null && max !== null) return `${formatMnt(max)} хүртэл`;
  if (min !== null && max === null) return `${formatMnt(min)}-с дээш`;
  if (min !== null && max !== null) return `${formatMnt(min)} – ${formatMnt(max)}`;
  return "Бүх үнийн дүн";
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await getServiceBySlug((await params).slug);
  if (!data) notFound();
  const { service, prices, requirements } = data;
  const range = priceRange(prices);
  const fixed = prices.filter((p) => p.pricingModel === "fixed");
  const pct = prices.filter((p) => p.pricingModel === "percentage");

  return (
    <Container className="py-12">
      <PageHeader
        eyebrow={service.code.replace("_", " ")}
        title={service.tagline}
        description={service.description}
        actions={service.isOrderable ? <ButtonLink href={`/order/${service.slug}`}>Захиалах</ButtonLink> : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="font-semibold">Хамрах хүрээ</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {service.scopeItems.map((t) => <li key={t} className="flex gap-3"><span aria-hidden className="text-good">✓</span>{t}</li>)}
            </ul>
            {service.excludedItems.length > 0 && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-muted">Хамаарахгүй</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted">
                  {service.excludedItems.map((t) => <li key={t}>— {t}</li>)}
                </ul>
              </>
            )}
          </Card>
          {requirements.length > 0 && (
            <Card>
              <h2 className="font-semibold">Бэлдэх баримт</h2>
              <ul className="mt-3 divide-y divide-line text-sm">
                {requirements.map((r) => (
                  <li key={r.code} className="py-2.5">
                    <span className="font-medium">{r.label}</span>{r.isRequired && <span className="ml-2 text-xs text-bad">заавал</span>}
                    {r.helpText && <p className="text-muted">{r.helpText}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="font-semibold">Үр дүн</h2>
            <p className="mt-2 text-sm text-muted">{service.deliverable}</p>
            <h2 className="mt-5 font-semibold">Хугацаа</h2>
            <p className="mt-2 text-sm text-muted">{service.turnaroundText || "—"}</p>
          </Card>
          <Card>
            <h2 className="font-semibold">Үнэ</h2>
            {fixed.length > 0 ? (
              <>
                {range && <p className="mt-2 font-display text-xl font-semibold">{formatMnt(range.min)} – {formatMnt(range.max)}</p>}
                <table className="mt-4 w-full text-left text-sm">
                  <caption className="sr-only">Үнийн жагсаалт</caption>
                  <thead className="text-xs text-muted"><tr><th className="py-1 font-medium">Төрөл</th><th className="py-1 font-medium">Үнийн дүн</th><th className="py-1 text-right font-medium">Хөлс</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {fixed.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 pr-2">{p.segment ? PROPERTY_TYPE_LABEL[p.segment as PropertyType] : "Бүгд"}</td>
                        <td className="py-2 pr-2 text-muted">{band(p.valueMinMnt, p.valueMaxMnt)}</td>
                        <td className="py-2 text-right tabular-nums">{formatMnt(p.amountMnt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted">НӨАТ орсон. Хөлсийг ажил эхлэхээс өмнө 100% төлнө.</p>
              </>
            ) : pct.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm">{pct.map((p) => <li key={p.id}>{p.label}</li>)}</ul>
            ) : (
              <Alert tone="neutral">Үнийн мэдээллийг удахгүй нийтэлнэ. Үнийн санал авахыг хүсвэл бидэнтэй холбогдоно уу.</Alert>
            )}
          </Card>
        </div>
      </div>
    </Container>
  );
}
