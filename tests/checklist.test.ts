/**
 * M CHECK due-diligence checklist: scope, final verdict rules, report draft
 * generation, and the database's overall-risk derivation.
 */
import { afterAll, describe, expect, it } from "vitest";
import { owner } from "./helpers/db";
import {
  CHECKLIST_ITEMS, draftFromChecklist, emptyChecklist, itemsInScope, pruneChecklist, summarize, type Checklist,
} from "@/lib/checklists/m-check";
import { emptyReport, overallRisk, reportContentSchema } from "@/lib/reports/schema";
import { renderReportPdf } from "@/lib/reports/pdf";

afterAll(async () => {
  await owner.end();
});

function allGreen(scope: "existing" | "new_project"): Checklist {
  const c: Checklist = { ...emptyChecklist(), scope };
  for (const i of itemsInScope(scope)) c.items[String(i.n)] = { v: "G", note: "" };
  return c;
}

describe("template", () => {
  it("has all 70 items from the source document, numbered 1..70", () => {
    expect(CHECKLIST_ITEMS.map((i) => i.n)).toEqual(Array.from({ length: 70 }, (_, k) => k + 1));
  });
  it("covers A–E for existing property and D, E, F1–F3 for a new project", () => {
    expect(new Set(itemsInScope("existing").map((i) => i.section))).toEqual(new Set(["A", "B", "C", "D", "E"]));
    expect(new Set(itemsInScope("new_project").map((i) => i.section))).toEqual(new Set(["D", "E", "F1", "F2", "F3"]));
    expect(itemsInScope(null)).toEqual([]);
  });
});

describe("final verdict", () => {
  it("is green only when every in-scope item is checked and none is yellow or red", () => {
    expect(summarize(allGreen("existing")).verdict).toBe("green");
  });
  it("is incomplete, never green, while items are unchecked", () => {
    const c = allGreen("existing");
    delete c.items["5"];
    const s = summarize(c);
    expect(s.verdict).toBe("incomplete");
    expect(s.unchecked).toBe(1);
  });
  it("any red makes the whole case red, even with yellows and unchecked items", () => {
    const c = allGreen("existing");
    c.items["3"] = { v: "R", note: "Банкны барьцаатай" };
    c.items["12"] = { v: "Y", note: "СӨХ өр 120,000₮" };
    delete c.items["30"];
    expect(summarize(c).verdict).toBe("red");
  });
  it("yellow without red is yellow; not-applicable items do not lower it", () => {
    const c = allGreen("new_project");
    c.items["53"] = { v: "Y", note: "" };
    c.items["63"] = { v: "NA", note: "" };
    expect(summarize(c).verdict).toBe("yellow");
  });
  it("pruning drops answers outside the chosen scope", () => {
    const c = allGreen("existing");
    c.items["45"] = { v: "R", note: "stale from another scope" };
    const p = pruneChecklist(c);
    expect(p.items["45"]).toBeUndefined();
    expect(summarize(p).verdict).toBe("green");
  });
});

describe("report draft from checklist", () => {
  it("turns red/yellow items into risks, unchecked into one not-verified risk, and writes summary and advice", () => {
    const c = allGreen("existing");
    c.items["3"] = { v: "R", note: "Хаан банкны барьцаанд, 2026-10-30 лавлагаа" };
    c.items["12"] = { v: "Y", note: "СӨХ-ийн өр 120,000₮" };
    delete c.items["30"];
    delete c.items["31"];
    const base = { ...emptyReport(), market_summary: "keep me", property_info: "keep me too" };
    const r = draftFromChecklist(base, c);

    expect(r.risks.map((x) => x.level)).toEqual(["high", "medium", "not_verified"]);
    expect(r.risks[0].title).toMatch(/^№3 /);
    expect(r.risks[0].description).toContain("Хаан банк");
    expect(r.risks[2].description).toContain("№30, №31");
    expect(overallRisk(r)).toBe("high");
    expect(r.executive_summary).toContain("Эцсийн дүгнэлт: Улаан");
    expect(r.recommendations).toContain("Худалдан авахгүй байхыг зөвлөнө");
    expect(r.recommendations).toContain("№12");
    expect(r.next_steps).toContain("№30, №31");
    // Sections the advisor writes by hand are kept.
    expect(r.market_summary).toBe("keep me");
    expect(r.property_info).toBe("keep me too");
    expect(r.limitations).toBe(base.limitations);
    // Document findings cover the legal/debt sections only, with mapped results.
    const doc3 = r.document_findings.find((f) => f.item.startsWith("№3 "));
    expect(doc3?.result).toBe("discrepancy");
    expect(r.document_findings.find((f) => f.item.startsWith("№17 "))).toBeUndefined();
    // The result is valid report content (fits the schema limits).
    expect(() => reportContentSchema.parse(r)).not.toThrow();
  });

  it("an all-green checklist gives one low risk and the positive recommendation", () => {
    const r = draftFromChecklist(emptyReport(), allGreen("new_project"));
    expect(r.risks).toHaveLength(1);
    expect(r.risks[0].level).toBe("low");
    expect(overallRisk(r)).toBe("low");
    expect(r.recommendations).toContain("Худалдан авч болно");
  });

  it("a red checklist item keeps the overall risk high even if the advisor deletes the risk row", () => {
    const c = allGreen("existing");
    c.items["4"] = { v: "R", note: "Шүүхийн маргаантай" };
    const r = { ...draftFromChecklist(emptyReport(), c), risks: [{ title: "x", level: "low" as const, description: "", evidence: "" }] };
    expect(overallRisk(r)).toBe("high");
  });

  it("the database derives the same overall risk from the checklist", async () => {
    const c = allGreen("existing");
    c.items["4"] = { v: "R", note: "" };
    const low = [{ title: "x", level: "low", description: "", evidence: "" }];
    const q = async (content: unknown) => (await owner`select app.overall_risk(${owner.json(content as never)}) as r`)[0].r;
    expect(await q({ risks: low, checklist: c })).toBe("high");
    c.items["4"] = { v: "Y", note: "" };
    expect(await q({ risks: low, checklist: c })).toBe("medium");
    expect(await q({ risks: low, checklist: null })).toBe("low");
    expect(await q({ risks: low })).toBe("low");
  });

  it("renders the PDF with the checklist appendix", async () => {
    const c = allGreen("existing");
    c.items["12"] = { v: "Y", note: "СӨХ-ийн өр 120,000₮" };
    const content = draftFromChecklist({ ...emptyReport(), market_summary: "Зах зээлийн үнэ." }, c);
    const pdf = await renderReportPdf({
      reportNumber: "MA-2026-000001-R", version: 1, publishedAt: new Date(), orderNumber: "MA-2026-000001",
      serviceName: "M CHECK", clientName: "Test", property: { type: "Орон сууц", address: "БЗД" },
      preparedBy: "Зөвлөх", approvedBy: "Хянагч", approvedAt: new Date(), content,
    });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(20_000);
  });
});
