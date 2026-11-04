"use client";

import {
  FINAL_LABEL, OWNER_LABEL, SCOPES, SCOPE_LABEL, VERDICTS, VERDICT_LABEL, VERDICT_SHORT,
  itemsInScope, sectionsInScope, summarize, type Checklist, type FinalVerdict, type Scope, type Verdict,
} from "@/lib/checklists/m-check";
import { Card, Textarea, cx } from "./ui";

const VERDICT_ON: Record<Verdict, string> = {
  G: "bg-good text-white border-good",
  Y: "bg-warn text-white border-warn",
  R: "bg-bad text-white border-bad",
  NA: "bg-muted text-white border-muted",
};
const FINAL_TONE: Record<FinalVerdict, string> = {
  green: "bg-good-soft text-good",
  yellow: "bg-warn-soft text-warn",
  red: "bg-bad-soft text-bad",
  incomplete: "bg-surface-2 text-muted",
};

export function ChecklistSummaryBar({ checklist }: { checklist: Checklist }) {
  const s = summarize(checklist);
  const done = s.total - s.unchecked;
  return (
    <div className={cx("rounded-lg px-4 py-3 text-sm", FINAL_TONE[s.verdict])} role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">Жагсаалтын дүгнэлт: {FINAL_LABEL[s.verdict]}</span>
        <span className="tabular-nums">{done} / {s.total} шалгасан</span>
      </div>
      {s.total > 0 && (
        <>
          <div className="mt-2 h-1.5 rounded-full bg-white/60"><div className="h-1.5 rounded-full bg-current" style={{ width: `${(done / s.total) * 100}%` }} /></div>
          <p className="mt-2 text-xs">Ногоон {s.counts.G} · Шар {s.counts.Y} · Улаан {s.counts.R} · Хамааралгүй {s.counts.NA}{s.unchecked ? ` · Шалгаагүй ${s.unchecked}` : ""}</p>
        </>
      )}
    </div>
  );
}

export function ChecklistPanel({ value, onChange, readOnly }: { value: Checklist; onChange: (c: Checklist) => void; readOnly?: boolean }) {
  const setScope = (scope: Scope) => onChange({ ...value, scope });
  const setItem = (n: number, patch: Partial<{ v: Verdict | null; note: string }>) => {
    const cur = value.items[String(n)] ?? { v: null, note: "" };
    onChange({ ...value, items: { ...value.items, [String(n)]: { ...cur, ...patch } } });
  };
  const items = itemsInScope(value.scope);

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <h2 className="font-semibold">Хөрөнгийн төрөл</h2>
        <p className="text-sm text-muted">Төрлөөс хамаарч шалгах хэсгүүд өөрчлөгдөнө. Ашиглалтад орсон: A–E. Шинэ төсөл: D, E, F1–F3.</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Хөрөнгийн төрөл">
          {SCOPES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={value.scope === s} disabled={readOnly} onClick={() => setScope(s)}
              className={cx("min-h-11 rounded-lg border px-4 text-sm font-medium transition",
                value.scope === s ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface hover:border-accent")}>
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
      </Card>

      {value.scope && <ChecklistSummaryBar checklist={value} />}

      {value.scope && (
        <p className="text-xs text-muted">
          Н = Ногоон (асуудалгүй), Ш = Шар (засах боломжтой, нөхцөл тавина), У = Улаан (худалдан авахгүй байхыг зөвлөнө), Х = Хамааралгүй.
          Нэг ч Улаан байвал эцсийн дүгнэлт Улаан болно.
        </p>
      )}

      {sectionsInScope(value.scope).map((sec) => (
        <section key={sec.code} className="overflow-hidden rounded-xl border border-line bg-surface" aria-label={sec.title}>
          <h2 className="border-b border-line px-4 py-3 font-semibold sm:px-6">{sec.code}. {sec.title}</h2>
          <ol className="divide-y divide-line">
            {items.filter((i) => i.section === sec.code).map((i) => {
              const a = value.items[String(i.n)];
              return (
                <li key={i.n} className="space-y-2 px-4 py-4 sm:px-6" data-item={i.n}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm"><span className="mr-1 font-semibold tabular-nums">№{i.n}</span>{i.text}</p>
                      <p className="mt-1 text-xs text-muted">{i.source} · {OWNER_LABEL[i.owner]}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5" role="radiogroup" aria-label={`№${i.n} дүгнэлт`}>
                      {VERDICTS.map((v) => (
                        <button key={v} type="button" role="radio" aria-checked={a?.v === v} title={VERDICT_LABEL[v]} aria-label={`№${i.n} ${VERDICT_LABEL[v]}`}
                          disabled={readOnly} onClick={() => setItem(i.n, { v: a?.v === v ? null : v })}
                          className={cx("h-10 w-11 rounded-md border text-sm font-semibold transition",
                            a?.v === v ? VERDICT_ON[v] : "border-line bg-surface text-ink hover:border-accent")}>
                          {VERDICT_SHORT[v]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(!readOnly || a?.note) && (
                    <Textarea aria-label={`№${i.n} тэмдэглэл`} rows={a?.v === "Y" || a?.v === "R" ? 2 : 1}
                      placeholder={a?.v === "Y" || a?.v === "R" ? "Юу илэрсэн, ямар нотолгоо (заавал бичихийг зөвлөнө)" : "Тэмдэглэл"}
                      value={a?.note ?? ""} disabled={readOnly} onChange={(e) => setItem(i.n, { note: e.target.value })} />
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
