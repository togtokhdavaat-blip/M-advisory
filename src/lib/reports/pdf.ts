import "server-only";
import PDFDocument from "pdfkit";
import { join } from "node:path";
import { formatDate, formatMnt } from "../format";
import { FINAL_LABEL, OWNER_LABEL, VERDICT_LABEL as CHECK_LABEL, VERDICT_SHORT, itemsInScope, sectionsInScope, summarize, SCOPE_LABEL, type Verdict } from "../checklists/m-check";
import { RISK_LABEL, VERIFICATION_LABEL, overallRisk, type ReportContent, type RiskLevel } from "./schema";

export interface ReportPdfInput {
  reportNumber: string;
  version: number;
  publishedAt: Date;
  orderNumber: string;
  serviceName: string;
  clientName: string;
  property: { type: string; address: string; area?: string | null; askingPrice?: number | null; registration?: string | null };
  preparedBy: string;
  approvedBy: string;
  approvedAt: Date;
  content: ReportContent;
}

const FONT = join(process.cwd(), "assets/fonts/DejaVuSans.ttf");
const FONT_BOLD = join(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf");
const INK = "#17232b";
const MUTED = "#5b6871";
const ACCENT = "#1d4e5f";
const BRASS = "#a8792a";
const RISK_COLOR: Record<RiskLevel, string> = { low: "#2f6b45", medium: "#8a6220", high: "#b23b2e", not_verified: "#5b6871" };

/** Render the approved report to a PDF (A4). Returns the bytes. */
export function renderReportPdf(r: ReportPdfInput): Promise<Uint8Array> {
  return new Promise((resolvePdf, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, bottom: 64, left: 56, right: 56 },
      bufferPages: true,
      info: { Title: `${r.serviceName} ${r.reportNumber} v${r.version}`, Author: "Симкас Пропертиз ХХК (M Properties)", Subject: r.orderNumber },
    });
    doc.registerFont("body", FONT);
    doc.registerFont("bold", FONT_BOLD);
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolvePdf(new Uint8Array(Buffer.concat(chunks))));
    doc.on("error", reject);

    const width = doc.page.width - 112;
    const h = (t: string) => {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.moveDown(0.8).font("bold").fontSize(12).fillColor(ACCENT).text(t).moveDown(0.3).fillColor(INK);
    };
    const p = (t: string, opts: PDFKit.Mixins.TextOptions = {}) => doc.font("body").fontSize(9.5).fillColor(INK).text(t || "—", { lineGap: 2, ...opts });
    const kv = (k: string, v: string) => {
      const y = doc.y;
      doc.font("body").fontSize(8.5).fillColor(MUTED).text(k, 56, y, { width: 150 });
      doc.font("body").fontSize(9.5).fillColor(INK).text(v || "—", 210, y, { width: width - 154 });
      doc.moveDown(0.2);
    };

    // Header
    doc.font("bold").fontSize(16).fillColor(ACCENT).text("M ADVISORY", { characterSpacing: 1.5 });
    doc.font("body").fontSize(8).fillColor(BRASS).text("TRUST CREATES VALUE.", { characterSpacing: 2 });
    doc.moveDown(1.2);
    doc.font("bold").fontSize(18).fillColor(INK).text(`${r.serviceName} — Эрсдэлийн шалгалтын тайлан`);
    doc.moveDown(0.6);
    kv("Тайлангийн дугаар", `${r.reportNumber} · хувилбар ${r.version}`);
    kv("Огноо", formatDate(r.publishedAt));
    kv("Захиалгын дугаар", r.orderNumber);
    kv("Захиалагч", r.clientName);
    kv("Хөрөнгө", `${r.property.type} · ${r.property.address}`);
    if (r.property.area) kv("Талбай", `${r.property.area} м²`);
    if (r.property.askingPrice) kv("Зарагдаж буй үнэ", formatMnt(r.property.askingPrice));
    if (r.property.registration) kv("Улсын бүртгэлийн дугаар", r.property.registration);

    const overall = overallRisk(r.content);
    doc.moveDown(0.6);
    const boxY = doc.y;
    doc.roundedRect(56, boxY, width, 34, 6).fill(RISK_COLOR[overall]);
    doc.font("bold").fontSize(11).fillColor("#ffffff").text(`Нийт эрсдэлийн түвшин: ${RISK_LABEL[overall]}`, 70, boxY + 11);
    doc.fillColor(INK).text("", 56, boxY + 44);
    const cl = r.content.checklist;
    if (cl?.scope) {
      const sm = summarize(cl);
      doc.font("body").fontSize(9).fillColor(MUTED).text(
        `Шалгах жагсаалтын дүгнэлт: ${FINAL_LABEL[sm.verdict]} · ${sm.total} зүйлээс Ногоон ${sm.counts.G}, Шар ${sm.counts.Y}, Улаан ${sm.counts.R}, Хамааралгүй ${sm.counts.NA}` +
        (sm.unchecked ? `, шалгагдаагүй ${sm.unchecked}` : "") + ". Дэлгэрэнгүйг хавсралтаас үзнэ үү.",
      );
      doc.fillColor(INK);
    }

    h("1. Гол дүгнэлт");
    p(r.content.executive_summary);
    h("2. Хөрөнгийн үндсэн мэдээлэл");
    p(r.content.property_info);

    h("3. Баримт бичгийн шалгалт");
    if (r.content.document_findings.length === 0) p("Бүртгэгдээгүй.");
    for (const f of r.content.document_findings) {
      doc.font("bold").fontSize(9.5).fillColor(INK).text(`${f.item} — ${VERIFICATION_LABEL[f.result]}`);
      if (f.note) p(f.note);
      if (f.source) doc.font("body").fontSize(8).fillColor(MUTED).text(`Эх сурвалж: ${f.source}`);
      doc.moveDown(0.3);
    }

    h("4. Зах зээлийн харьцуулсан шинжилгээ");
    p(r.content.market_summary);
    for (const c of r.content.comparables) {
      p(`• ${c.description}${c.price_mnt ? ` — ${formatMnt(c.price_mnt)}` : ""}${c.area_sqm ? `, ${c.area_sqm} м²` : ""}${c.source ? ` (${c.source})` : ""}`);
    }

    h("5. Илэрсэн эрсдэлүүд");
    for (const [i, risk] of r.content.risks.entries()) {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.font("bold").fontSize(9.5).fillColor(RISK_COLOR[risk.level]).text(`${i + 1}. [${RISK_LABEL[risk.level]}] `, { continued: true }).fillColor(INK).text(risk.title);
      if (risk.description) p(risk.description);
      if (risk.evidence) doc.font("body").fontSize(8).fillColor(MUTED).text(`Нотлох эх сурвалж: ${risk.evidence}`);
      doc.moveDown(0.3);
    }

    h("6. Зөвлөмж");
    p(r.content.recommendations);
    if (r.content.next_steps) {
      h("7. Дараагийн алхам");
      p(r.content.next_steps);
    }
    h("Хязгаарлалт, хүчинтэй нөхцөл");
    p(r.content.limitations, { align: "justify" });

    h("Бэлтгэсэн ба баталсан");
    kv("Бэлтгэсэн зөвлөх", r.preparedBy);
    kv("Хянаж баталсан", `${r.approvedBy} · ${formatDate(r.approvedAt, true)}`);
    kv("Гүйцэтгэгч", "Симкас Пропертиз ХХК (брэнд нэр: M Properties)");

    if (cl?.scope) {
      doc.addPage();
      doc.font("bold").fontSize(13).fillColor(ACCENT).text(`Хавсралт. Шалгах жагсаалт (${SCOPE_LABEL[cl.scope]}, хувилбар ${cl.version})`);
      doc.font("body").fontSize(8).fillColor(MUTED).text("Н = Ногоон, Ш = Шар, У = Улаан, Х = Хамааралгүй, — = шалгагдаагүй (эрсдэлгүй гэсэн үг биш).").moveDown(0.4);
      const VCOLOR: Record<Verdict, string> = { G: RISK_COLOR.low, Y: RISK_COLOR.medium, R: RISK_COLOR.high, NA: MUTED };
      const items = itemsInScope(cl.scope);
      for (const sec of sectionsInScope(cl.scope)) {
        if (doc.y > doc.page.height - 120) doc.addPage();
        doc.moveDown(0.4).font("bold").fontSize(10).fillColor(ACCENT).text(`${sec.code}. ${sec.title}`).moveDown(0.2);
        for (const it of items.filter((i) => i.section === sec.code)) {
          if (doc.y > doc.page.height - 90) doc.addPage();
          const a = cl.items[String(it.n)];
          const y = doc.y;
          doc.font("bold").fontSize(8.5).fillColor(a?.v ? VCOLOR[a.v] : MUTED).text(a?.v ? VERDICT_SHORT[a.v] : "—", 56, y, { width: 18 });
          doc.font("body").fontSize(8.5).fillColor(INK).text(`№${it.n} ${it.text}`, 76, y, { width: width - 20 });
          if (a?.note) doc.font("body").fontSize(8).fillColor(INK).text(`${a.v ? CHECK_LABEL[a.v] : "Тэмдэглэл"}: ${a.note}`, 76, doc.y, { width: width - 20 });
          doc.font("body").fontSize(7.5).fillColor(MUTED).text(`${it.source} · ${OWNER_LABEL[it.owner]}`, 76, doc.y, { width: width - 20 });
          doc.moveDown(0.35);
        }
      }
      doc.x = 56;
    }

    // Footer on every page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // allow writing in the footer area without a page break
      const y = doc.page.height - 40;
      doc.font("body").fontSize(7.5).fillColor(MUTED)
        .text(`${r.reportNumber} v${r.version} · Нууц баримт — зөвхөн захиалагчид зориулав`, 56, y, { width: width - 60, lineBreak: false })
        .text(`${i + 1} / ${range.count}`, 56, y, { width, align: "right", lineBreak: false });
    }
    doc.end();
  });
}
