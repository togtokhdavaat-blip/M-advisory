"use client";

import { useState } from "react";
import {
  RISK_LABEL, RISK_LEVELS, VERIFICATION_LABEL, VERIFICATION_RESULTS, overallRisk, type ReportContent, type RiskLevel,
} from "@/lib/reports/schema";
import { Button, Card, Field, Input, Select, Textarea, cx } from "./ui";

const RISK_TONE: Record<RiskLevel, string> = {
  low: "bg-good-soft text-good",
  medium: "bg-warn-soft text-warn",
  high: "bg-bad-soft text-bad",
  not_verified: "bg-surface-2 text-muted",
};

export function ReportEditor({ initial, action, readOnly }: { initial: ReportContent; action: (f: FormData) => void; readOnly?: boolean }) {
  const [c, setC] = useState<ReportContent>(initial);
  const set = <K extends keyof ReportContent>(k: K, v: ReportContent[K]) => setC((p) => ({ ...p, [k]: v }));
  const upd = <K extends "document_findings" | "comparables" | "risks">(k: K, i: number, patch: Partial<ReportContent[K][number]>) =>
    setC((p) => ({ ...p, [k]: (p[k] as ReportContent[K][number][]).map((row, j) => (j === i ? { ...row, ...patch } : row)) }));
  const del = (k: "document_findings" | "comparables" | "risks", i: number) => setC((p) => ({ ...p, [k]: (p[k] as unknown[]).filter((_, j) => j !== i) }));
  const overall = overallRisk(c);
  const dis = readOnly;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="content" value={JSON.stringify(c)} />
      <div className={cx("rounded-lg px-4 py-3 text-sm font-semibold", RISK_TONE[overall])} role="status">
        Нийт эрсдэлийн түвшин (автоматаар): {RISK_LABEL[overall]}
      </div>

      <Card className="space-y-4">
        <Field label="1. Гол дүгнэлт (Executive Summary)" name="es" required>
          <Textarea id="es" rows={5} value={c.executive_summary} disabled={dis} onChange={(e) => set("executive_summary", e.target.value)} />
        </Field>
        <Field label="2. Хөрөнгийн үндсэн мэдээлэл" name="pi">
          <Textarea id="pi" rows={4} value={c.property_info} disabled={dis} onChange={(e) => set("property_info", e.target.value)} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">3. Баримт бичгийн шалгалт</h2>
          {!dis && <Button type="button" variant="ghost" onClick={() => set("document_findings", [...c.document_findings, { item: "", result: "not_verified", note: "", source: "" }])}>+ Мөр нэмэх</Button>}
        </div>
        {c.document_findings.map((f, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[1fr_180px]">
            <Input aria-label="Шалгасан баримт" placeholder="Жишээ: Өмчлөлийн гэрчилгээ" value={f.item} disabled={dis} onChange={(e) => upd("document_findings", i, { item: e.target.value })} />
            <Select aria-label="Үр дүн" value={f.result} disabled={dis} onChange={(e) => upd("document_findings", i, { result: e.target.value as typeof f.result })}>
              {VERIFICATION_RESULTS.map((r) => <option key={r} value={r}>{VERIFICATION_LABEL[r]}</option>)}
            </Select>
            <Textarea aria-label="Тайлбар" rows={2} placeholder="Тайлбар" className="sm:col-span-2" value={f.note} disabled={dis} onChange={(e) => upd("document_findings", i, { note: e.target.value })} />
            <Input aria-label="Эх сурвалж" placeholder="Эх сурвалж (бүртгэлийн лавлагаа №, огноо)" value={f.source} disabled={dis} onChange={(e) => upd("document_findings", i, { source: e.target.value })} />
            {!dis && <Button type="button" variant="ghost" className="text-bad" onClick={() => del("document_findings", i)}>Устгах</Button>}
          </div>
        ))}
      </Card>

      <Card className="space-y-4">
        <Field label="4. Зах зээлийн харьцуулсан шинжилгээ" name="ms">
          <Textarea id="ms" rows={4} value={c.market_summary} disabled={dis} onChange={(e) => set("market_summary", e.target.value)} />
        </Field>
        {c.comparables.map((x, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[1fr_160px_110px]">
            <Input aria-label="Харьцуулсан хөрөнгө" placeholder="Харьцуулсан хөрөнгө" value={x.description} disabled={dis} onChange={(e) => upd("comparables", i, { description: e.target.value })} />
            <Input aria-label="Үнэ (₮)" placeholder="Үнэ ₮" inputMode="numeric" value={x.price_mnt ?? ""} disabled={dis}
              onChange={(e) => upd("comparables", i, { price_mnt: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} />
            <Input aria-label="Талбай м²" placeholder="м²" inputMode="decimal" value={x.area_sqm ?? ""} disabled={dis}
              onChange={(e) => upd("comparables", i, { area_sqm: e.target.value ? Number(e.target.value.replace(",", ".")) || null : null })} />
            <Input aria-label="Эх сурвалж" placeholder="Эх сурвалж" className="sm:col-span-2" value={x.source} disabled={dis} onChange={(e) => upd("comparables", i, { source: e.target.value })} />
            {!dis && <Button type="button" variant="ghost" className="text-bad" onClick={() => del("comparables", i)}>Устгах</Button>}
          </div>
        ))}
        {!dis && <Button type="button" variant="ghost" onClick={() => set("comparables", [...c.comparables, { description: "", price_mnt: null, area_sqm: null, source: "" }])}>+ Харьцуулалт нэмэх</Button>}
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">5. Илэрсэн эрсдэлүүд <span className="text-bad">*</span></h2>
          {!dis && <Button type="button" variant="ghost" onClick={() => set("risks", [...c.risks, { title: "", level: "not_verified", description: "", evidence: "" }])}>+ Эрсдэл нэмэх</Button>}
        </div>
        <p className="text-xs text-muted">«Баталгаажаагүй» нь мэдээлэл хангалтгүй гэсэн утгатай. Үүнийг «Бага» болгож хэзээ ч өөрчлөхгүй.</p>
        {c.risks.map((r, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[1fr_180px]">
            <Input aria-label="Эрсдэлийн нэр" placeholder="Жишээ: Хөрөнгө банкны барьцаанд байгаа" value={r.title} disabled={dis} onChange={(e) => upd("risks", i, { title: e.target.value })} />
            <Select aria-label="Түвшин" value={r.level} disabled={dis} onChange={(e) => upd("risks", i, { level: e.target.value as RiskLevel })}>
              {RISK_LEVELS.map((l) => <option key={l} value={l}>{RISK_LABEL[l]}</option>)}
            </Select>
            <Textarea aria-label="Тайлбар" rows={3} placeholder="Тайлбар, нөлөө" className="sm:col-span-2" value={r.description} disabled={dis} onChange={(e) => upd("risks", i, { description: e.target.value })} />
            <Input aria-label="Нотлох эх сурвалж" placeholder="Нотлох эх сурвалж" value={r.evidence} disabled={dis} onChange={(e) => upd("risks", i, { evidence: e.target.value })} />
            {!dis && <Button type="button" variant="ghost" className="text-bad" onClick={() => del("risks", i)}>Устгах</Button>}
          </div>
        ))}
      </Card>

      <Card className="space-y-4">
        <Field label="6. Зөвлөмж" name="rec" required><Textarea id="rec" rows={4} value={c.recommendations} disabled={dis} onChange={(e) => set("recommendations", e.target.value)} /></Field>
        <Field label="7. Дараагийн алхам" name="ns"><Textarea id="ns" rows={3} value={c.next_steps} disabled={dis} onChange={(e) => set("next_steps", e.target.value)} /></Field>
        <Field label="Хязгаарлалт, хүчинтэй нөхцөл" name="lim" required><Textarea id="lim" rows={5} value={c.limitations} disabled={dis} onChange={(e) => set("limitations", e.target.value)} /></Field>
      </Card>

      {!dis && (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="submit" name="intent" value="save" variant="secondary">Ноорог хадгалах</Button>
          <Button type="submit" name="intent" value="submit">Хянуулахаар илгээх</Button>
        </div>
      )}
    </form>
  );
}
