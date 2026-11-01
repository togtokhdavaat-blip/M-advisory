/**
 * Authorization tests against the real migrations. Every query runs with the
 * same role switch + JWT claims the application uses, so these exercise RLS
 * and the SECURITY DEFINER workflow functions exactly as production would.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createUser, grant, owner, rejects } from "./helpers/db";

const property = {
  property_type: "apartment",
  title: "Test apartment",
  district: "Хан-Уул",
  address: "11-р хороо, 15-р байр, 42 тоот",
  asking_price_mnt: "350000000",
};
const parties = [{ party_role: "buyer", full_name: "Client A", is_client: true }];

let clientA: string, clientB: string, advisor1: string, reviewer1: string, branchAdmin2: string, superAdmin: string, advisor2: string;
let orderA: string;
let branch1: string;

beforeAll(async () => {
  clientA = await createUser("a@test.mn", "Client A");
  clientB = await createUser("b@test.mn", "Client B");
  advisor1 = await createUser("adv1@test.mn", "Advisor One");
  advisor2 = await createUser("adv2@test.mn", "Advisor Two");
  reviewer1 = await createUser("rev1@test.mn", "Reviewer One");
  branchAdmin2 = await createUser("ba2@test.mn", "Branch Admin Two");
  superAdmin = await createUser("sa@test.mn", "Super Admin");
  await grant(advisor1, "ADVISOR", "UB1");
  await grant(advisor2, "ADVISOR", "UB2");
  await grant(reviewer1, "REVIEWER", "UB1");
  await grant(branchAdmin2, "BRANCH_ADMIN", "UB2");
  await grant(superAdmin, "SUPER_ADMIN", null);
  branch1 = (await owner`select id from branches where code = 'UB1'`)[0].id as string;
});

afterAll(async () => {
  await owner.end();
});

describe("registration bootstrap", () => {
  it("creates a profile and CLIENT membership for every new auth user", async () => {
    const rows = await owner`select role from memberships where user_id = ${clientA}`;
    expect(rows.map((r) => r.role)).toEqual(["CLIENT"]);
    const p = await owner`select full_name, email from profiles where id = ${clientA}`;
    expect(p[0]).toMatchObject({ full_name: "Client A", email: "a@test.mn" });
  });
});

describe("public catalogue", () => {
  it("anon sees active services but no unapproved prices", async () => {
    const services = await as(null, (tx) => tx`select code from services order by sort_order`);
    expect(services.map((s) => s.code)).toContain("M_CHECK");
    const prices = await as(null, (tx) => tx`select id from service_prices`);
    expect(prices).toHaveLength(0);
  });

  it("anon cannot read orders, profiles or audit logs", async () => {
    await rejects(as(null, (tx) => tx`select * from orders`), "permission denied");
    await rejects(as(null, (tx) => tx`select * from profiles`), "permission denied");
    await rejects(as(null, (tx) => tx`select * from audit_logs`), "permission denied");
  });

  it("clients cannot edit the catalogue or prices", async () => {
    const r = await as(clientA, (tx) => tx`update services set name = 'HACK' where code = 'M_CHECK' returning id`);
    expect(r).toHaveLength(0);
    await rejects(as(clientA, (tx) => tx`select app.revise_service_price((select id from service_prices limit 1), 1, null, 'approved')`), "forbidden");
  });
});

describe("orders: ownership and isolation", () => {
  it("client creates a draft through the workflow function", async () => {
    const r = await as(clientA, (tx) => tx`select * from app.create_order_draft('M_CHECK', ${tx.json(property)}, ${tx.json(parties)}, 'note')`);
    orderA = r[0].id as string;
    expect(r[0].status).toBe("draft");
    expect(r[0].order_number).toMatch(/^MA-\d{4}-\d{6}$/);
    expect(r[0].branch_id).toBe(branch1);
  });

  it("client cannot write orders directly (no INSERT/UPDATE grant)", async () => {
    await rejects(as(clientA, (tx) => tx`insert into orders (order_number, client_id, branch_id, service_id) values ('X', ${clientA}, ${branch1}, (select id from services limit 1))`), "permission denied");
    await rejects(as(clientA, (tx) => tx`update orders set amount_mnt = 1 where id = ${orderA}`), "permission denied");
    await rejects(as(clientA, (tx) => tx`delete from orders where id = ${orderA}`), "permission denied");
  });

  it("another client can neither see nor modify the order", async () => {
    const seen = await as(clientB, (tx) => tx`select id from orders where id = ${orderA}`);
    expect(seen).toHaveLength(0);
    const prop = await as(clientB, (tx) => tx`select id from properties`);
    expect(prop).toHaveLength(0);
    await rejects(as(clientB, (tx) => tx`select app.update_order_draft(${orderA}::uuid, ${tx.json(property)}, null, null)`), "order_not_found");
    await rejects(as(clientB, (tx) => tx`select app.submit_order(${orderA}::uuid, true)`), "order_not_found");
    await rejects(as(clientB, (tx) => tx`select app.transition_order(${orderA}::uuid, 'cancelled', 'x')`), "order_not_found");
  });

  it("unassigned staff in another branch cannot see the order", async () => {
    for (const u of [advisor1, advisor2, reviewer1, branchAdmin2]) {
      const seen = await as(u, (tx) => tx`select id from orders where id = ${orderA}`);
      expect(seen, u).toHaveLength(0);
    }
    const seen = await as(superAdmin, (tx) => tx`select id from orders where id = ${orderA}`);
    expect(seen).toHaveLength(1);
  });
});

describe("pricing and submission", () => {
  it("submission fails while prices are only proposed", async () => {
    await rejects(as(clientA, (tx) => tx`select app.submit_order(${orderA}::uuid, true)`), "price_not_configured");
  });

  it("submission requires accepting the terms", async () => {
    await rejects(as(clientA, (tx) => tx`select app.submit_order(${orderA}::uuid, false)`), "terms_not_accepted");
  });

  it("super admin approves prices; submit freezes the price snapshot", async () => {
    await as(superAdmin, async (tx) => {
      const ids = await tx`select id from service_prices where status = 'proposed' and pricing_model = 'fixed' and effective_to is null`;
      for (const r of ids) await tx`select app.revise_service_price(${r.id}::uuid, null, null, 'approved')`;
    });
    const r = await as(clientA, (tx) => tx`select * from app.submit_order(${orderA}::uuid, true)`);
    expect(r[0].status).toBe("awaiting_payment");
    expect(r[0].amount_mnt).toBe(200000); // apartment, < ₮500M band
    expect(r[0].price_snapshot.amount_mnt).toBe(200000);
    expect(r[0].terms_version).toBe("m-check-v1");
    const consent = await as(clientA, (tx) => tx`select consent_type from consents where order_id = ${orderA}`);
    expect(consent.map((c) => c.consent_type)).toEqual(["service_terms"]);
  });

  it("changing a price afterwards does not change the agreed amount", async () => {
    await as(superAdmin, async (tx) => {
      const p = await tx`select service_price_id from orders where id = ${orderA}`;
      await tx`select app.revise_service_price(${p[0].service_price_id}::uuid, 999999, null, 'approved')`;
    });
    const o = await owner`select amount_mnt from orders where id = ${orderA}`;
    expect(o[0].amount_mnt).toBe(200000);
  });

  it("a price referenced by an order cannot be edited in place", async () => {
    await rejects(
      owner`update service_prices set amount_mnt = 1 where id = (select service_price_id from orders where id = ${orderA})`,
      "price_in_use_create_new_version",
    );
  });
});

describe("payments", () => {
  let paymentId: string;

  it("clients cannot create or confirm payments themselves", async () => {
    await rejects(as(clientA, (tx) => tx`insert into payments (order_id, amount_mnt, provider, idempotency_key) values (${orderA}, 200000, 'mock', 'k')`), "permission denied");
    await rejects(as(clientA, (tx) => tx`select app.confirm_payment(gen_random_uuid(), 'x')`), "permission denied");
  });

  it("clients cannot mark an order paid via transition_order", async () => {
    await rejects(as(clientA, (tx) => tx`select app.transition_order(${orderA}::uuid, 'paid')`), "transition_not_allowed");
  });

  it("server confirms a verified payment exactly once", async () => {
    const p = await owner`insert into payments (order_id, amount_mnt, provider, idempotency_key, provider_invoice_id)
                          values (${orderA}, 200000, 'mock', 'order:a:1', 'INV-1') returning id`;
    paymentId = p[0].id as string;
    await owner`select app.confirm_payment(${paymentId}::uuid, 'PAY-1')`;
    await owner`select app.confirm_payment(${paymentId}::uuid, 'PAY-1')`; // replay is a no-op
    const o = await owner`select status from orders where id = ${orderA}`;
    expect(o[0].status).toBe("paid");
    const h = await owner`select count(*)::int as n from order_status_history where order_id = ${orderA} and to_status = 'paid'`;
    expect(h[0].n).toBe(1);
  });

  it("a second paid payment for the same order is rejected by the database", async () => {
    await rejects(
      owner`insert into payments (order_id, amount_mnt, provider, idempotency_key, status) values (${orderA}, 200000, 'mock', 'order:a:2', 'paid')`,
      "payments_one_paid_per_order_idx",
    );
  });

  it("duplicate webhook events are ignored by the unique event key", async () => {
    await owner`insert into payment_events (payment_id, provider, provider_event_id, event_type) values (${paymentId}, 'mock', 'evt-1', 'paid')`;
    const again = await owner`insert into payment_events (payment_id, provider, provider_event_id, event_type) values (${paymentId}, 'mock', 'evt-1', 'paid') on conflict do nothing returning id`;
    expect(again).toHaveLength(0);
  });

  it("the client can see their own payment but not its raw provider events", async () => {
    const mine = await as(clientA, (tx) => tx`select id from payments where order_id = ${orderA}`);
    expect(mine).toHaveLength(1);
    const events = await as(clientA, (tx) => tx`select id from payment_events`);
    expect(events).toHaveLength(0);
  });
});

describe("assignment and branch isolation", () => {
  it("an admin of another branch cannot assign", async () => {
    await rejects(as(branchAdmin2, (tx) => tx`select app.assign_order(${orderA}::uuid, ${advisor1}::uuid, 'advisor')`), "order_not_found");
  });

  it("an advisor from another branch cannot be assigned", async () => {
    await rejects(as(superAdmin, (tx) => tx`select app.assign_order(${orderA}::uuid, ${advisor2}::uuid, 'advisor')`), "assignee_lacks_role");
  });

  it("assigning the advisor moves a paid order to assigned and grants access", async () => {
    await as(superAdmin, (tx) => tx`select app.assign_order(${orderA}::uuid, ${advisor1}::uuid, 'advisor')`);
    const o = await owner`select status from orders where id = ${orderA}`;
    expect(o[0].status).toBe("assigned");
    const seen = await as(advisor1, (tx) => tx`select id from orders where id = ${orderA}`);
    expect(seen).toHaveLength(1);
    const reviewerSees = await as(reviewer1, (tx) => tx`select id from orders where id = ${orderA}`);
    expect(reviewerSees).toHaveLength(0);
  });

  it("the advisor cannot also be the reviewer (four-eyes)", async () => {
    await grant(advisor1, "REVIEWER", "UB1");
    await rejects(as(superAdmin, (tx) => tx`select app.assign_order(${orderA}::uuid, ${advisor1}::uuid, 'reviewer')`), "reviewer_must_differ_from_advisor");
  });

  it("the assigned reviewer gains access", async () => {
    await as(superAdmin, (tx) => tx`select app.assign_order(${orderA}::uuid, ${reviewer1}::uuid, 'reviewer')`);
    const seen = await as(reviewer1, (tx) => tx`select id from orders where id = ${orderA}`);
    expect(seen).toHaveLength(1);
  });

  it("advisors cannot assign or manage roles", async () => {
    await rejects(as(advisor1, (tx) => tx`select app.assign_order(${orderA}::uuid, ${advisor1}::uuid, 'advisor')`), "order_not_found");
    await rejects(as(advisor1, (tx) => tx`select app.grant_role(${advisor1}::uuid, 'SUPER_ADMIN', null)`), "forbidden");
    await rejects(as(clientA, (tx) => tx`select app.find_user_id_by_email('sa@test.mn')`), "forbidden");
  });

  it("branch admins may only add advisors/reviewers to their own branch", async () => {
    await rejects(as(branchAdmin2, (tx) => tx`select app.grant_role(${clientB}::uuid, 'ADVISOR', ${branch1}::uuid)`), "forbidden");
    await rejects(as(branchAdmin2, (tx) => tx`select app.grant_role(${clientB}::uuid, 'SUPER_ADMIN', null)`), "forbidden");
    const ub2 = (await owner`select id from branches where code = 'UB2'`)[0].id as string;
    await as(branchAdmin2, (tx) => tx`select app.grant_role(${clientB}::uuid, 'ADVISOR', ${ub2}::uuid)`);
  });
});

describe("workflow transitions", () => {
  it("only the right actor can move each step", async () => {
    await rejects(as(clientA, (tx) => tx`select app.transition_order(${orderA}::uuid, 'in_progress')`), "transition_not_allowed");
    await as(advisor1, (tx) => tx`select app.transition_order(${orderA}::uuid, 'in_progress')`);
    await as(advisor1, (tx) => tx`select app.transition_order(${orderA}::uuid, 'under_review')`);
    // Completion only happens by publishing an approved report (system actor).
    await rejects(as(reviewer1, (tx) => tx`select app.transition_order(${orderA}::uuid, 'completed')`), "transition_not_allowed");
    await rejects(as(superAdmin, (tx) => tx`select app.transition_order(${orderA}::uuid, 'completed')`), "transition_not_allowed");
    await as(reviewer1, (tx) => tx`select app.transition_order(${orderA}::uuid, 'revision_requested', 'add evidence')`);
    const o = await owner`select status from orders where id = ${orderA}`;
    expect(o[0].status).toBe("revision_requested");
  });

  it("every change is recorded with actor and time", async () => {
    const h = await owner`select to_status, changed_by from order_status_history where order_id = ${orderA} order by created_at`;
    expect(h.map((r) => r.to_status)).toEqual(["draft", "awaiting_payment", "paid", "assigned", "in_progress", "under_review", "revision_requested"]);
    expect(h.find((r) => r.to_status === "revision_requested")?.changed_by).toBe(reviewer1);
    expect(h.find((r) => r.to_status === "paid")?.changed_by).toBeNull(); // system
  });

  it("admin cancellation requires a reason", async () => {
    await rejects(as(superAdmin, (tx) => tx`select app.transition_order(${orderA}::uuid, 'cancelled', '')`), "reason_required");
  });

  it("the client sees status history but not the audit log", async () => {
    const h = await as(clientA, (tx) => tx`select id from order_status_history where order_id = ${orderA}`);
    expect(h.length).toBeGreaterThan(0);
    const a = await as(clientA, (tx) => tx`select id from audit_logs`);
    expect(a).toHaveLength(0);
    const sa = await as(superAdmin, (tx) => tx`select count(*)::int as n from audit_logs`);
    expect(sa[0].n).toBeGreaterThan(0);
  });
});

describe("documents and reports", () => {
  it("internal staff documents are hidden from the client", async () => {
    await owner`insert into documents (order_id, storage_path, original_name, mime_type, size_bytes, uploaded_by, is_internal)
                values (${orderA}, ${`orders/${orderA}/internal.pdf`}, 'work.pdf', 'application/pdf', 100, ${advisor1}, true),
                       (${orderA}, ${`orders/${orderA}/cert.pdf`}, 'cert.pdf', 'application/pdf', 100, ${clientA}, false)`;
    const client = await as(clientA, (tx) => tx`select original_name from documents where order_id = ${orderA}`);
    expect(client.map((d) => d.original_name)).toEqual(["cert.pdf"]);
    const adv = await as(advisor1, (tx) => tx`select original_name from documents where order_id = ${orderA} order by original_name`);
    expect(adv.map((d) => d.original_name)).toEqual(["cert.pdf", "work.pdf"]);
    const other = await as(clientB, (tx) => tx`select id from documents`);
    expect(other).toHaveLength(0);
  });

  it("a client cannot attach a document to someone else's order", async () => {
    await rejects(
      as(clientB, (tx) => tx`insert into documents (order_id, storage_path, original_name, mime_type, size_bytes, uploaded_by)
                             values (${orderA}, 'orders/x/y.pdf', 'y.pdf', 'application/pdf', 1, ${clientB})`),
      "row-level security",
    );
  });

  it("clients only see published report versions", async () => {
    await owner`insert into reports (order_id, report_number, version, status, prepared_by) values (${orderA}, 'R-1', 1, 'draft', ${advisor1})`;
    const c = await as(clientA, (tx) => tx`select id from reports`);
    expect(c).toHaveLength(0);
    const a = await as(advisor1, (tx) => tx`select id from reports`);
    expect(a).toHaveLength(1);
  });

  it("a report cannot be published without approval, nor approved by its author", async () => {
    await rejects(owner`update reports set status = 'published', published_at = now() where report_number = 'R-1'`, "reports_publish_requires_approval");
    await rejects(owner`update reports set approved_by = prepared_by, approved_at = now() where report_number = 'R-1'`, "reports_reviewer_not_preparer");
  });
});
