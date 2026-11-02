import "server-only";
import type { SessionUser } from "../auth";
import { asUser } from "../db";
import { PROPERTY_TYPE_LABEL, type PropertyType } from "../labels";
import { storage } from "../storage";
import { sha256Hex } from "../storage/files";
import { renderReportPdf } from "./pdf";
import { reportContentSchema } from "./schema";

/**
 * Render the approved version to PDF, store it privately, then publish it.
 * Publishing (in the database) completes the order and notifies the client.
 * Safe to retry: an already published report is returned unchanged.
 */
export async function publishApprovedReport(user: SessionUser, reportId: string) {
  const data = await asUser(user, async (tx) => {
    const r = (await tx`
      select r.*, o.order_number, o.id as order_id, s.name as service_name,
             c.full_name as client_name, pp.full_name as prepared_name, ap.full_name as approved_name,
             p.property_type, p.address, p.district, p.khoroo, p.area_sqm, p.asking_price_mnt, p.registration_number
      from reports r join orders o on o.id = r.order_id join services s on s.id = o.service_id
      left join profiles c on c.id = o.client_id
      left join profiles pp on pp.id = r.prepared_by left join profiles ap on ap.id = r.approved_by
      left join properties p on p.id = o.property_id
      where r.id = ${reportId}`)[0];
    return r;
  });
  if (!data) throw new Error("report_not_found");
  if (data.status === "published") return data;
  if (data.status !== "approved") throw new Error("report_not_approved");

  const content = reportContentSchema.parse(data.content);
  const publishedAt = new Date();
  const pdf = await renderReportPdf({
    reportNumber: data.report_number as string,
    version: data.version as number,
    publishedAt,
    orderNumber: data.order_number as string,
    serviceName: data.service_name as string,
    clientName: (data.client_name as string) || "—",
    property: {
      type: PROPERTY_TYPE_LABEL[data.property_type as PropertyType] ?? "",
      address: [data.district, data.khoroo, data.address].filter(Boolean).join(", "),
      area: data.area_sqm ? String(data.area_sqm) : null,
      askingPrice: (data.asking_price_mnt as number) ?? null,
      registration: (data.registration_number as string) ?? null,
    },
    preparedBy: (data.prepared_name as string) || "—",
    approvedBy: (data.approved_name as string) || "—",
    approvedAt: new Date(data.approved_at as string),
    content,
  });
  const sha = sha256Hex(pdf);
  const path = `orders/${data.order_id}/report-v${data.version}-${sha.slice(0, 12)}.pdf`;
  try {
    await storage().put("reports", path, pdf, "application/pdf");
  } catch (e) {
    // A previous attempt may have stored the identical file already.
    if (!String((e as Error).message).match(/exist|EEXIST|Duplicate/i)) throw e;
  }
  return asUser(user, async (tx) => (await tx`select * from app.publish_report(${reportId}::uuid, ${path}, ${sha})`)[0]);
}
