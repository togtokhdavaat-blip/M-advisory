import "server-only";
import { asAnon } from "./db";

export interface ServiceRow {
  id: string;
  code: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  deliverable: string;
  scopeItems: string[];
  excludedItems: string[];
  turnaroundText: string;
  isOrderable: boolean;
  termsVersion: string;
  termsText: string;
}

export interface PriceRow {
  id: string;
  segment: string | null;
  valueMinMnt: number | null;
  valueMaxMnt: number | null;
  pricingModel: "fixed" | "percentage" | "hourly" | "quote";
  amountMnt: number | null;
  percentBps: number | null;
  minFeeMnt: number | null;
  label: string;
}

const mapService = (r: Record<string, unknown>): ServiceRow => ({
  id: r.id as string,
  code: r.code as string,
  slug: r.slug as string,
  name: r.name as string,
  tagline: r.tagline as string,
  description: r.description as string,
  deliverable: r.deliverable as string,
  scopeItems: (r.scope_items as string[]) ?? [],
  excludedItems: (r.excluded_items as string[]) ?? [],
  turnaroundText: r.turnaround_text as string,
  isOrderable: r.is_orderable as boolean,
  termsVersion: r.terms_version as string,
  termsText: r.terms_text as string,
});

const mapPrice = (r: Record<string, unknown>): PriceRow => ({
  id: r.id as string,
  segment: (r.segment as string) ?? null,
  valueMinMnt: (r.value_min_mnt as number) ?? null,
  valueMaxMnt: (r.value_max_mnt as number) ?? null,
  pricingModel: r.pricing_model as PriceRow["pricingModel"],
  amountMnt: (r.amount_mnt as number) ?? null,
  percentBps: (r.percent_bps as number) ?? null,
  minFeeMnt: (r.min_fee_mnt as number) ?? null,
  label: r.label as string,
});

/** Public catalogue, read as `anon` so RLS decides what is visible. */
export async function listServices(): Promise<ServiceRow[]> {
  const rows = await asAnon((tx) => tx`select * from services order by sort_order, name`);
  return rows.map(mapService);
}

export async function getServiceBySlug(slug: string): Promise<{ service: ServiceRow; prices: PriceRow[]; requirements: { code: string; label: string; helpText: string; isRequired: boolean; appliesTo: string[] | null }[] } | null> {
  return asAnon(async (tx) => {
    const s = await tx`select * from services where slug = ${slug}`;
    if (!s[0]) return null;
    const prices = await tx`select * from service_prices where service_id = ${s[0].id} order by segment nulls first, value_min_mnt nulls first`;
    const reqs = await tx`select code, label, help_text, is_required, applies_to::text[] as applies_to from service_requirements where service_id = ${s[0].id} order by sort_order`;
    return {
      service: mapService(s[0]),
      prices: prices.map(mapPrice),
      requirements: reqs.map((r) => ({
        code: r.code as string,
        label: r.label as string,
        helpText: r.help_text as string,
        isRequired: r.is_required as boolean,
        appliesTo: (r.applies_to as string[]) ?? null,
      })),
    };
  });
}

/** Lowest/highest approved fixed price, for "₮200,000-аас" style teasers. */
export function priceRange(prices: PriceRow[]): { min: number; max: number } | null {
  const amounts = prices.filter((p) => p.pricingModel === "fixed" && p.amountMnt !== null).map((p) => p.amountMnt!);
  return amounts.length ? { min: Math.min(...amounts), max: Math.max(...amounts) } : null;
}
