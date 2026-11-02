/**
 * Report lifecycle and document rules, end to end through the database
 * functions, plus PDF rendering and upload validation.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, createUser, grant, owner, rejects } from "./helpers/db";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
process.env.LOCAL_STORAGE_DIR = `.data/test-storage-${Date.now()}`;

const { publishApprovedReport } = await import("@/lib/reports/service");
const { uploadDocument, authorizeDownload, authorizeReportDownload, DocumentError } = await import("@/lib/documents/service");
const { sniffMime } = await import("@/lib/storage/files");
const { renderReportPdf } = await import("@/lib/reports/pdf");
const { emptyReport, overallRisk } = await import("@/lib/reports/schema");
const { sql } = await import("@/lib/db");

let client: string, other: string, advisor: string, reviewer: string, admin: string, orderId: string;
const u = (id: string, email: string) => ({ id, email });

const goodContent = () => ({
  ...emptyReport(),
  executive_summary: "Хөрөнгө барьцаанд байна. Худалдан авахаас өмнө барьцааг чөлөөлүүлэх шаардлагатай.",
  recommendations: "Барьцаа чөлөөлөгдсөний дараа гэрээ байгуулна.",
  risks: [
    { title: "Банкны барьцаа", level: "high", description: "Хаан банкны барьцаанд.", evidence: "Бүртгэлийн лавлагаа 2026-10-30" },
    { title: "Кадастр", level: "not_verified", description: "Мэдээлэл ирээгүй.", evidence: "" },
  ],
});

beforeAll(async () => {
  client = await createUser("rep-client@test.mn", "Rep Client");
  other = await createUser("rep-other@test.mn", "Rep Other");
  advisor = await createUser("rep-adv@test.mn", "Rep Advisor");
  reviewer = await createUser("rep-rev@test.mn", "Rep Reviewer");
  admin = await createUser("rep-admin@test.mn", "Rep Admin");
  await grant(advisor, "ADVISOR", "UB1");
  await grant(reviewer, "REVIEWER", "UB1");
  await grant(admin, "BRANCH_ADMIN", "UB1");
  await owner`update service_prices set status = 'approved' where status = 'proposed' and pricing_model = 'fixed'`;
  const r = await as(client, (tx) => tx`select id from app.create_order_draft('M_CHECK',
    ${tx.json({ property_type: "house", address: "Хан-Уул, Зайсан, 7-р гудамж", asking_price_mnt: "1500000000" })},
    ${tx.json([{ party_role: "buyer", full_name: "Rep Client", is_client: true }])}, null)`);
  orderId = r[0].id as string;
  await as(client, (tx) => tx`select app.submit_order(${orderId}::uuid, true)`);
  const p = await owner`insert into payments (order_id, amount_mnt, provider, idempotency_key, provider_invoice_id)
    select id, amount_mnt, 'mock', 'rep:1', 'REP-INV' from orders where id = ${orderId} returning id`;
  await owner`select app.confirm_payment(${p[0].id}::uuid, 'REP-PAY')`;
  await as(admin, (tx) => tx`select app.assign_order(${orderId}::uuid, ${advisor}::uuid, 'advisor')`);
});

afterAll(async () => {
  await sql().end();
  await owner.end();
});

describe("report lifecycle", () => {
  let reportId: string;

  it("only the assigned advisor can write a draft; starting it moves the order to in_progress", async () => {
    await rejects(as(reviewer, (tx) => tx`select app.save_report_draft(${orderId}::uuid, '{}'::jsonb)`), "order_not_found");
    await rejects(as(client, (tx) => tx`select app.save_report_draft(${orderId}::uuid, '{}'::jsonb)`), "order_not_found");
    const r = await as(advisor, (tx) => tx`select * from app.save_report_draft(${orderId}::uuid, ${tx.json(emptyReport() as never)})`);
    reportId = r[0].id as string;
    expect(r[0]).toMatchObject({ version: 1, status: "draft" });
    expect((await owner`select status from orders where id = ${orderId}`)[0].status).toBe("in_progress");
  });

  it("an incomplete report cannot be submitted", async () => {
    await rejects(as(advisor, (tx) => tx`select app.submit_report(${reportId}::uuid)`), "report_incomplete");
  });

  it("submission requires a reviewer to be assigned", async () => {
    await as(advisor, (tx) => tx`select app.save_report_draft(${orderId}::uuid, ${tx.json(goodContent() as never)})`);
    await rejects(as(advisor, (tx) => tx`select app.submit_report(${reportId}::uuid)`), "reviewer_not_assigned");
    await as(admin, (tx) => tx`select app.assign_order(${orderId}::uuid, ${reviewer}::uuid, 'reviewer')`);
  });

  it("submitting freezes the version, derives overall risk and moves the order to under_review", async () => {
    const r = await as(advisor, (tx) => tx`select * from app.submit_report(${reportId}::uuid)`);
    expect(r[0]).toMatchObject({ status: "submitted", overall_risk: "high" });
    await rejects(as(advisor, (tx) => tx`select app.save_report_draft(${orderId}::uuid, '{}'::jsonb)`), "report_not_editable_in_status");
    expect((await owner`select status from orders where id = ${orderId}`)[0].status).toBe("under_review");
  });

  it("the client cannot see an unpublished report", async () => {
    expect(await as(client, (tx) => tx`select id from reports`)).toHaveLength(0);
    expect(await authorizeReportDownload(u(client, "rep-client@test.mn"), reportId)).toBeNull();
  });

  it("only the reviewer can review; a revision needs comments and starts a new version", async () => {
    await rejects(as(advisor, (tx) => tx`select app.review_report(${reportId}::uuid, 'approved', '')`), "report_not_found");
    await rejects(as(reviewer, (tx) => tx`select app.review_report(${reportId}::uuid, 'revision_requested', '')`), "comments_required");
    await as(reviewer, (tx) => tx`select app.review_report(${reportId}::uuid, 'revision_requested', 'Кадастрын лавлагааг нэм')`);
    expect((await owner`select status from orders where id = ${orderId}`)[0].status).toBe("revision_requested");
    const v2 = await as(advisor, (tx) => tx`select * from app.save_report_draft(${orderId}::uuid, ${tx.json(goodContent() as never)})`);
    expect(v2[0]).toMatchObject({ version: 2, status: "draft" });
    reportId = v2[0].id as string;
    await as(advisor, (tx) => tx`select app.submit_report(${reportId}::uuid)`);
    expect((await owner`select status from orders where id = ${orderId}`)[0].status).toBe("under_review");
  });

  it("an unapproved report cannot be published", async () => {
    await rejects(as(reviewer, (tx) => tx`select app.publish_report(${reportId}::uuid, 'x.pdf', ${"a".repeat(64)})`), "report_not_approved");
  });

  it("approval + publishing renders a PDF, completes the order and notifies the client", async () => {
    await as(reviewer, (tx) => tx`select app.review_report(${reportId}::uuid, 'approved', 'OK')`);
    const pub = await publishApprovedReport(u(reviewer, "rep-rev@test.mn"), reportId);
    expect(pub.status).toBe("published");
    expect((await owner`select status from orders where id = ${orderId}`)[0].status).toBe("completed");
    const n = await owner`select title from notifications where user_id = ${client} and type = 'report.published'`;
    expect(n).toHaveLength(1);
    // retry is harmless
    expect((await publishApprovedReport(u(reviewer, "rep-rev@test.mn"), reportId)).status).toBe("published");
  });

  it("the client can now download the published PDF; another client cannot", async () => {
    const f = await authorizeReportDownload(u(client, "rep-client@test.mn"), reportId);
    expect(f?.path).toMatch(/^orders\/.+\/report-v2-[a-f0-9]{12}\.pdf$/);
    expect(await authorizeReportDownload(u(other, "rep-other@test.mn"), reportId)).toBeNull();
    const versions = await as(client, (tx) => tx`select version from reports where order_id = ${orderId}`);
    expect(versions.map((v) => v.version)).toEqual([2]); // v1 (revision) stays internal
  });

  it("the client can rate a completed order once", async () => {
    await as(client, (tx) => tx`insert into order_feedback (order_id, client_id, rating) values (${orderId}, ${client}, 5)`);
    await rejects(as(client, (tx) => tx`insert into order_feedback (order_id, client_id, rating) values (${orderId}, ${client}, 4)`), "duplicate key");
    await rejects(as(other, (tx) => tx`insert into order_feedback (order_id, client_id, rating) values (${orderId}, ${other}, 1)`), "row-level security");
  });
});

describe("documents", () => {
  const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  let orderB: string;

  beforeAll(async () => {
    const r = await as(other, (tx) => tx`select id from app.create_order_draft('M_CHECK',
      ${tx.json({ property_type: "apartment", address: "Баянзүрх, 26-р хороо", asking_price_mnt: "200000000" })}, '[]'::jsonb, null)`);
    orderB = r[0].id as string;
  });

  it("detects real file types and rejects disguised files", () => {
    expect(sniffMime(pdf)).toBe("application/pdf");
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(sniffMime(new TextEncoder().encode("MZ\x90\x00"))).toBeNull();
  });

  it("stores a valid upload privately and lets only authorized users download it", async () => {
    const { id } = await uploadDocument(u(other, "rep-other@test.mn"), orderB, new File([pdf], "../../etc/гэрчилгээ.pdf", { type: "text/html" }));
    const row = (await owner`select original_name, mime_type, storage_path, sha256, scan_status from documents where id = ${id}`)[0];
    expect(row.original_name).toBe("гэрчилгээ.pdf");
    expect(row.mime_type).toBe("application/pdf");
    expect(row.storage_path).toMatch(/^orders\/[0-9a-f-]+\/[0-9a-f-]+\.pdf$/);
    expect(row.scan_status).toBe("skipped");
    expect(await authorizeDownload(u(other, "rep-other@test.mn"), id)).not.toBeNull();
    expect(await authorizeDownload(u(client, "rep-client@test.mn"), id)).toBeNull();
    expect(await authorizeDownload(u(advisor, "rep-adv@test.mn"), id)).toBeNull(); // not assigned
  });

  it("rejects wrong types, oversized files and other people's orders", async () => {
    const html = new File(["<html>"], "x.pdf", { type: "application/pdf" });
    await expect(uploadDocument(u(other, ""), orderB, html)).rejects.toMatchObject({ code: "file_type_not_allowed" });
    const big = new File([new Uint8Array(21 * 1024 * 1024)], "big.pdf");
    await expect(uploadDocument(u(other, ""), orderB, big)).rejects.toMatchObject({ code: "file_too_large" });
    await expect(uploadDocument(u(client, ""), orderB, new File([pdf], "a.pdf"))).rejects.toBeInstanceOf(DocumentError);
    expect((await owner`select count(*)::int as n from documents where order_id = ${orderB}`)[0].n).toBe(1);
  });

  it("clients cannot upload to a completed order", async () => {
    await expect(uploadDocument(u(client, ""), orderId, new File([pdf], "late.pdf"))).rejects.toMatchObject({ code: "order_not_found" });
  });
});

describe("pdf + risk rules", () => {
  it("renders Cyrillic content to a valid PDF", async () => {
    const bytes = await renderReportPdf({
      reportNumber: "MA-2026-000001-R", version: 1, publishedAt: new Date(), orderNumber: "MA-2026-000001",
      serviceName: "M CHECK", clientName: "Бат", property: { type: "Орон сууц", address: "Хан-Уул" },
      preparedBy: "Зөвлөх", approvedBy: "Хянагч", approvedAt: new Date(), content: { ...emptyReport(), ...goodContent() } as never,
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(5000);
  });

  it("never reports 'low' when something is not verified", () => {
    expect(overallRisk({ risks: [{ title: "", level: "low", description: "", evidence: "" }, { title: "", level: "not_verified", description: "", evidence: "" }] })).toBe("not_verified");
    expect(overallRisk({ risks: [] })).toBe("not_verified");
  });
});
