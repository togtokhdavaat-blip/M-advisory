import { z } from "zod";
import type { ReportContent, RiskLevel } from "../reports/schema";
import { CHECKLIST_ITEMS, CHECKLIST_SECTIONS, type SectionCode } from "./m-check-items";

export { CHECKLIST_ITEMS, CHECKLIST_SECTIONS, type SectionCode };

export const CHECKLIST_VERSION = "1.0";

/** Н / Ш / У / Х from the due-diligence checklist. "" = not checked yet. */
export const VERDICTS = ["G", "Y", "R", "NA"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const VERDICT_LABEL: Record<Verdict, string> = { G: "Ногоон", Y: "Шар", R: "Улаан", NA: "Хамааралгүй" };
export const VERDICT_SHORT: Record<Verdict, string> = { G: "Н", Y: "Ш", R: "У", NA: "Х" };

export const SCOPES = ["existing", "new_project"] as const;
export type Scope = (typeof SCOPES)[number];
export const SCOPE_LABEL: Record<Scope, string> = { existing: "Ашиглалтад орсон үл хөдлөх", new_project: "Шинэ төсөл" };

/** Which checklist sections an M CHECK of each property kind covers. */
const SCOPE_SECTIONS: Record<Scope, readonly SectionCode[]> = {
  existing: ["A", "B", "C", "D", "E"],
  new_project: ["D", "E", "F1", "F2", "F3"],
};
/** Sections whose items are document/legal checks (reported under "Баримт бичгийн шалгалт"). */
const DOCUMENT_SECTIONS: readonly SectionCode[] = ["A", "B", "F1", "F2", "F3"];

export const OWNER_LABEL = { lawyer: "Хуульч", advisor: "Зөвлөх", analyst: "Шинжээч", director: "Захирал" } as const;

export const checklistSchema = z.object({
  version: z.string().max(10).default(CHECKLIST_VERSION),
  scope: z.enum(SCOPES).nullable().default(null),
  items: z
    .record(z.string().regex(/^\d{1,3}$/), z.object({ v: z.enum(VERDICTS).nullable().default(null), note: z.string().trim().max(2000).default("") }))
    .default({}),
});
export type Checklist = z.infer<typeof checklistSchema>;

export function emptyChecklist(): Checklist {
  return { version: CHECKLIST_VERSION, scope: null, items: {} };
}

export function itemsInScope(scope: Scope | null) {
  if (!scope) return [];
  const s = SCOPE_SECTIONS[scope];
  return CHECKLIST_ITEMS.filter((i) => s.includes(i.section));
}

export function sectionsInScope(scope: Scope | null) {
  if (!scope) return [];
  return CHECKLIST_SECTIONS.filter((s) => SCOPE_SECTIONS[scope].includes(s.code));
}

/** Drop answers for items outside the chosen scope, so stale answers never count. */
export function pruneChecklist(c: Checklist): Checklist {
  const keep = new Set(itemsInScope(c.scope).map((i) => String(i.n)));
  const items: Checklist["items"] = {};
  for (const [k, a] of Object.entries(c.items)) if (keep.has(k) && (a.v || a.note)) items[k] = a;
  return { ...c, items };
}

export type FinalVerdict = "green" | "yellow" | "red" | "incomplete";
export const FINAL_LABEL: Record<FinalVerdict, string> = { green: "Ногоон", yellow: "Шар", red: "Улаан", incomplete: "Дуусаагүй" };
export const FINAL_ADVICE: Record<Exclude<FinalVerdict, "incomplete">, string> = {
  green: "Худалдан авч болно.",
  yellow: "Нөхцөлийг хэлцлээс өмнө бичгээр шийдвэрлэсний дараа авна.",
  red: "Худалдан авахгүй байхыг зөвлөнө.",
};

export interface ChecklistSummary {
  total: number;
  counts: Record<Verdict, number>;
  unchecked: number;
  verdict: FinalVerdict;
}

/**
 * Final verdict per the checklist rules: any Red makes the whole case Red,
 * a Red is never traded down for the deal; otherwise any Yellow makes it
 * Yellow; unchecked items keep it "incomplete" instead of turning it Green.
 */
export function summarize(c: Checklist): ChecklistSummary {
  const items = itemsInScope(c.scope);
  const counts: Record<Verdict, number> = { G: 0, Y: 0, R: 0, NA: 0 };
  let unchecked = 0;
  for (const i of items) {
    const v = c.items[String(i.n)]?.v;
    if (v) counts[v]++;
    else unchecked++;
  }
  const verdict: FinalVerdict =
    counts.R > 0 ? "red" : counts.Y > 0 ? "yellow" : unchecked > 0 || items.length === 0 ? "incomplete" : "green";
  return { total: items.length, counts, unchecked, verdict };
}

const VERDICT_RISK: Record<"Y" | "R", RiskLevel> = { Y: "medium", R: "high" };
const DOC_RESULT = { G: "verified", Y: "discrepancy", R: "discrepancy", NA: "not_applicable" } as const;

function title(text: string) {
  const t = text.split(/[:;]/)[0].trim();
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

/**
 * Build the report sections from the advisor's checklist. Market analysis,
 * comparables, property info and limitations are left as they are. The
 * advisor reviews and edits the result; a reviewer still has to approve it.
 */
export function draftFromChecklist(content: ReportContent, checklist: Checklist): ReportContent {
  const c = pruneChecklist(checklist);
  const items = itemsInScope(c.scope);
  const s = summarize(c);
  const answer = (n: number) => c.items[String(n)];
  const ref = (n: number) => `№${n}`;

  const flagged = (v: "Y" | "R") => items.filter((i) => answer(i.n)?.v === v);
  const reds = flagged("R");
  const yellows = flagged("Y");
  const unchecked = items.filter((i) => !answer(i.n)?.v);

  const risks: ReportContent["risks"] = [...reds, ...yellows].map((i) => ({
    title: `${ref(i.n)} ${title(i.text)}`,
    level: VERDICT_RISK[answer(i.n)!.v as "Y" | "R"],
    description: answer(i.n)!.note || i.text,
    evidence: i.source,
  }));
  if (unchecked.length > 0) {
    risks.push({
      title: `Шалгагдаагүй ${unchecked.length} зүйл`,
      level: "not_verified",
      description: `Дараах зүйлийг шалгаж баталгаажуулаагүй тул эрсдэлгүй гэж үзэхгүй: ${unchecked.map((i) => ref(i.n)).join(", ")}.`,
      evidence: "",
    });
  }
  if (risks.length === 0 && s.verdict === "green") {
    risks.push({
      title: "Шалгах жагсаалтаар ноцтой эрсдэл илрээгүй",
      level: "low",
      description: `Хамрах хүрээний ${s.total} зүйлийг шалгаж, Улаан болон Шар зүйл илрээгүй.`,
      evidence: "Шалгах жагсаалт, хувилбар " + c.version,
    });
  }

  const document_findings: ReportContent["document_findings"] = items
    .filter((i) => DOCUMENT_SECTIONS.includes(i.section))
    .map((i) => {
      const a = answer(i.n);
      return { item: `${ref(i.n)} ${title(i.text)}`, result: a?.v ? DOC_RESULT[a.v] : "not_verified", note: a?.note ?? "", source: i.source };
    });

  const scopeText = c.scope ? SCOPE_LABEL[c.scope] : "—";
  const countLine =
    `Шалгах жагсаалтын (${scopeText}) ${s.total} зүйлээс Ногоон ${s.counts.G}, Шар ${s.counts.Y}, Улаан ${s.counts.R}, ` +
    `Хамааралгүй ${s.counts.NA}` + (s.unchecked ? `, шалгагдаагүй ${s.unchecked}` : "") + ".";
  const summaryParts = [countLine, `Эцсийн дүгнэлт: ${FINAL_LABEL[s.verdict]}.`];
  if (reds.length) summaryParts.push(`Улаан зүйлс: ${reds.map((i) => `${ref(i.n)} ${title(i.text)}`).join("; ")}.`);
  if (yellows.length) summaryParts.push(`Шар зүйлс: ${yellows.map((i) => `${ref(i.n)} ${title(i.text)}`).join("; ")}.`);
  if (s.verdict === "incomplete") summaryParts.push("Шалгалт бүрэн дуусаагүй тул эцсийн зөвлөмж өгөхөд мэдээлэл хангалтгүй.");

  const recs: string[] = [];
  if (s.verdict === "red") recs.push(FINAL_ADVICE.red);
  else if (s.verdict === "yellow") recs.push(FINAL_ADVICE.yellow);
  else if (s.verdict === "green") recs.push(FINAL_ADVICE.green);
  else recs.push("Шалгагдаагүй зүйлсийг баталгаажуулсны дараа эцсийн шийдвэр гаргахыг зөвлөнө.");
  if (yellows.length) {
    recs.push("Хэлцлээс өмнө бичгээр шийдвэрлэх нөхцөл:");
    for (const i of yellows) recs.push(`• ${ref(i.n)} ${title(i.text)}${answer(i.n)?.note ? `: ${answer(i.n)!.note}` : ""}`);
  }
  if (reds.length && yellows.length === 0) {
    for (const i of reds) recs.push(`• ${ref(i.n)} ${title(i.text)}${answer(i.n)?.note ? `: ${answer(i.n)!.note}` : ""}`);
  }

  const next: string[] = [];
  if (unchecked.length) next.push(`Шалгагдаагүй зүйлсийг баталгаажуулах: ${unchecked.map((i) => ref(i.n)).join(", ")}.`);
  if (answer(28)?.v === "Y" || answer(28)?.v === "R") next.push("Барилгын инженерийн бие даасан дүгнэлт авах.");
  if (s.verdict !== "red") next.push("Төлбөр хийхээс өмнө улсын бүртгэлийн шинэ лавлагаа (3 хоногоос хэтрээгүй) дахин авах.");

  return {
    ...content,
    executive_summary: summaryParts.join("\n"),
    document_findings,
    risks,
    recommendations: recs.join("\n"),
    next_steps: next.join("\n"),
    checklist: c,
  };
}
