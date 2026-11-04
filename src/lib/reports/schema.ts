import { z } from "zod";
import { checklistSchema } from "../checklists/m-check";

export const RISK_LEVELS = ["low", "medium", "high", "not_verified"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "Бага",
  medium: "Дунд",
  high: "Өндөр",
  not_verified: "Баталгаажаагүй",
};

export const VERIFICATION_RESULTS = ["verified", "discrepancy", "not_verified", "not_applicable"] as const;
export const VERIFICATION_LABEL: Record<(typeof VERIFICATION_RESULTS)[number], string> = {
  verified: "Баталгаажсан",
  discrepancy: "Зөрүүтэй",
  not_verified: "Баталгаажаагүй",
  not_applicable: "Хамааралгүй",
};

const text = (max: number) => z.string().trim().max(max).default("");

export const reportContentSchema = z.object({
  executive_summary: text(6000),
  property_info: text(4000),
  document_findings: z
    .array(z.object({ item: text(300), result: z.enum(VERIFICATION_RESULTS), note: text(2000), source: text(500) }))
    .max(80)
    .default([]),
  market_summary: text(6000),
  comparables: z
    .array(z.object({ description: text(300), price_mnt: z.number().int().nonnegative().nullable().default(null), area_sqm: z.number().nonnegative().nullable().default(null), source: text(500) }))
    .max(20)
    .default([]),
  risks: z
    .array(z.object({ title: text(300), level: z.enum(RISK_LEVELS), description: text(4000), evidence: text(2000) }))
    .max(80)
    .default([]),
  recommendations: text(6000),
  next_steps: text(4000),
  limitations: text(6000),
  // Advisor's due-diligence checklist (M CHECK). Null on reports written before it existed.
  checklist: checklistSchema.nullable().default(null),
});
export type ReportContent = z.infer<typeof reportContentSchema>;

/** Default limitations wording; advisors edit per case. */
export const DEFAULT_LIMITATIONS =
  "Энэхүү тайлан нь худалдан авах шийдвэр гаргахад туслах мэргэжлийн дүгнэлт бөгөөд хууль зүйн дүгнэлт, банк, шүүхэд хүлээн зөвшөөрөгдөх лицензтэй үнэлгээ биш. " +
  "Дүгнэлт нь тайлангийн огноонд байгаа, Захиалагчийн өгсөн болон нээлттэй эх сурвалжаас авсан мэдээлэлд үндэслэсэн. «Баталгаажаагүй» гэсэн хэсэг нь мэдээлэл хангалтгүй гэсэн утгатай бөгөөд эрсдэлгүй гэсэн үг биш. " +
  "Улсын бүртгэл, кадастр, лицензтэй үнэлгээ, хууль зүйн дүгнэлт шаардлагатай асуудлыг эрх бүхий мэргэжилтэнээр баталгаажуулна. Тайлан нь гаргасан өдрөөс хойш 30 хоногийн турш хүчинтэй.";

export function emptyReport(): ReportContent {
  return reportContentSchema.parse({ limitations: DEFAULT_LIMITATIONS });
}

/**
 * Overall risk: high > medium > not_verified > low. A Red checklist item counts
 * as high and a Yellow one as medium even if the advisor removed the matching
 * risk row, so the checklist verdict can never be traded down. Mirrors
 * app.overall_risk in SQL.
 */
export function overallRisk(c: Pick<ReportContent, "risks"> & { checklist?: ReportContent["checklist"] }): RiskLevel {
  const answers = Object.values(c.checklist?.items ?? {}).map((a) => a.v);
  const has = (l: RiskLevel) => c.risks.some((r) => r.level === l);
  if (has("high") || answers.includes("R")) return "high";
  if (has("medium") || answers.includes("Y")) return "medium";
  if (has("not_verified")) return "not_verified";
  if (has("low")) return "low";
  return "not_verified";
}
