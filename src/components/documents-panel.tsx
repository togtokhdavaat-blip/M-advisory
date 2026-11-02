import { formatDate } from "@/lib/format";
import { uploadDocumentAction } from "@/app/dashboard/orders/doc-actions";
import { Badge, Button, Card } from "./ui";

export interface DocRow {
  id: string;
  original_name: string;
  size_bytes: number;
  created_at: string;
  scan_status: string;
  is_internal: boolean;
  uploader?: string | null;
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function DocumentsPanel({
  orderId, docs, back, canUpload, staff, requirements,
}: { orderId: string; docs: DocRow[]; back: string; canUpload: boolean; staff?: boolean; requirements?: { code: string; label: string }[] }) {
  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Баримт бичиг</h2>
      {docs.length === 0 ? <p className="text-sm text-muted">Баримт байршуулаагүй байна.</p> : (
        <ul className="divide-y divide-line text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                {["clean", "skipped"].includes(d.scan_status)
                  ? <a href={`/api/documents/${d.id}`} className="break-all font-medium text-accent">{d.original_name}</a>
                  : <span className="break-all font-medium">{d.original_name}</span>}
                <span className="block text-xs text-muted">{kb(d.size_bytes)} · {formatDate(d.created_at, true)}{d.uploader ? ` · ${d.uploader}` : ""}</span>
              </span>
              <span className="flex gap-1">
                {d.is_internal && <Badge tone="neutral">Дотоод</Badge>}
                {d.scan_status === "pending" && <Badge tone="warn">Шалгаж байна</Badge>}
                {d.scan_status === "infected" && <Badge tone="bad">Хортой</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <form action={uploadDocumentAction.bind(null, orderId, back)} className="space-y-3 border-t border-line pt-4">
          {requirements && requirements.length > 0 && (
            <select name="documentType" aria-label="Баримтын төрөл" className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
              {requirements.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              <option value="other">Бусад</option>
            </select>
          )}
          <input type="file" name="file" multiple required accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            aria-label="Файл сонгох" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:font-semibold file:text-accent" />
          {staff && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="internal" className="size-4" /> Дотоод материал (харилцагчид харагдахгүй)</label>}
          <p className="text-xs text-muted">PDF, JPG, PNG, WEBP, HEIC · нэг файл 20MB хүртэл · хаалттай хадгалалтад байрлана.</p>
          <Button variant="secondary" className="w-full">Байршуулах</Button>
        </form>
      )}
    </Card>
  );
}
