import "server-only";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "../auth";
import { asSystem, asUser } from "../db";
import { storage } from "../storage";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, cleanFileName, sha256Hex, sniffMime } from "../storage/files";
import { scanFile } from "../storage/scan";

export class DocumentError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const RETENTION_DAYS = Number(process.env.DOCUMENT_RETENTION_DAYS ?? 365 * 5);

/**
 * Validate, store and register an uploaded file. Metadata is inserted under
 * the user's RLS (so access is re-checked by the database) inside the same
 * transaction as the upload: if either fails, nothing is kept.
 */
export async function uploadDocument(
  user: SessionUser,
  orderId: string,
  file: File,
  opts: { documentType?: string; isInternal?: boolean } = {},
) {
  if (!(file instanceof File) || file.size === 0) throw new DocumentError("file_required");
  if (file.size > MAX_UPLOAD_BYTES) throw new DocumentError("file_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) throw new DocumentError("file_type_not_allowed");

  const id = randomUUID();
  const path = `orders/${orderId}/${id}.${ALLOWED_TYPES[mime]}`;
  const sha = sha256Hex(bytes);
  const docType = (opts.documentType ?? "other").replace(/[^a-z0-9_]/g, "").slice(0, 48) || "other";
  const retention = new Date(Date.now() + RETENTION_DAYS * 86400_000).toISOString().slice(0, 10);

  try {
    await asUser(user, async (tx) => {
      await tx`
        insert into documents (id, order_id, storage_path, original_name, mime_type, size_bytes, sha256,
                               document_type, uploaded_by, is_internal, retention_until)
        values (${id}, ${orderId}, ${path}, ${cleanFileName(file.name)}, ${mime}, ${bytes.length}, ${sha},
                ${docType}, ${user.id}, ${opts.isInternal ?? false}, ${retention})`;
      await storage().put("order-documents", path, bytes, mime);
    });
  } catch (e) {
    const m = String((e as Error).message);
    if (m.includes("row-level security")) throw new DocumentError("order_not_found");
    throw e;
  }

  const result = await scanFile(bytes, mime);
  await asSystem(async (tx) => {
    await tx`update documents set scan_status = ${result} where id = ${id}`;
    await tx`insert into audit_logs (actor_id, action, entity_type, entity_id, metadata)
             values (${user.id}, 'document.uploaded', 'document', ${id}, ${tx.json({ order: orderId, sha256: sha, scan: result })})`;
  });
  if (result === "infected") {
    await storage().remove("order-documents", path);
    await asSystem((tx) => tx`update documents set deleted_at = now() where id = ${id}`);
    throw new DocumentError("file_infected");
  }
  return { id, path };
}

/** Resolve a download the user is allowed to make (RLS decides), and log it. */
export async function authorizeDownload(user: SessionUser, documentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return null;
  const rows = await asUser(user, (tx) => tx`
    select id, storage_bucket, storage_path, original_name, mime_type, scan_status
    from documents where id = ${documentId}`);
  const d = rows[0];
  if (!d || !["clean", "skipped"].includes(d.scan_status as string)) return null;
  await asSystem((tx) => tx`insert into audit_logs (actor_id, action, entity_type, entity_id) values (${user.id}, 'document.downloaded', 'document', ${documentId})`);
  return { bucket: "order-documents" as const, path: d.storage_path as string, name: d.original_name as string, mime: d.mime_type as string };
}

export async function authorizeReportDownload(user: SessionUser, reportId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return null;
  // RLS: clients only see published versions; staff see the orders they work on.
  const rows = await asUser(user, (tx) => tx`select id, file_path, report_number, version from reports where id = ${reportId} and file_path is not null`);
  const r = rows[0];
  if (!r) return null;
  await asSystem((tx) => tx`insert into audit_logs (actor_id, action, entity_type, entity_id) values (${user.id}, 'report.downloaded', 'report', ${reportId})`);
  return { bucket: "reports" as const, path: r.file_path as string, name: `${r.report_number}-v${r.version}.pdf`, mime: "application/pdf" };
}

/** Retention job: remove files past their retention date or soft-deleted more than 30 days ago. */
export async function purgeExpiredDocuments(): Promise<number> {
  const rows = await asSystem((tx) => tx`
    select id, storage_path from documents
    where (retention_until < current_date) or (deleted_at < now() - interval '30 days')
    limit 500`);
  for (const r of rows) {
    await storage().remove("order-documents", r.storage_path as string);
    await asSystem(async (tx) => {
      await tx`update documents set deleted_at = coalesce(deleted_at, now()), storage_path = ${`purged/${r.id}`} where id = ${r.id}`;
      await tx`insert into audit_logs (action, entity_type, entity_id) values ('document.purged', 'document', ${r.id})`;
    });
  }
  return rows.length;
}
