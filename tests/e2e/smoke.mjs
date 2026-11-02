/**
 * Browser smoke test of the M CHECK journey against a running server.
 *   BASE_URL=http://localhost:3000 node tests/e2e/smoke.mjs
 * Requires: fresh `npm run db:reset && npm run db:seed-dev`, PAYMENT_PROVIDER=mock.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Uses the project dependency if installed, else a globally installed Playwright.
const { chromium } = require("playwright");
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? "test-results/screens";
mkdirSync(SHOTS, { recursive: true });
const stamp = Date.now();
const steps = [];
const ok = (m) => { steps.push(`✓ ${m}`); console.log(`✓ ${m}`); };
function assert(cond, m) { if (!cond) throw new Error(`FAILED: ${m}`); ok(m); }
/** Auto-waiting visibility check (client-side navigations render after the URL changes). */
const seen = (locator) => locator.waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false);

const browser = await chromium.launch();
const ctx = (opts = {}) => browser.newContext({ baseURL: BASE, ...opts });

async function login(page, email, password = "DevPassword123", next = "") {
  await page.goto(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
}

try {
  // --- Public pages -------------------------------------------------------
  const mobile = await ctx({ viewport: { width: 390, height: 844 }, isMobile: true });
  const m = await mobile.newPage();
  await m.goto("/");
  assert(await seen(m.getByRole("heading", { level: 1 })), "home renders on mobile");
  await m.screenshot({ path: `${SHOTS}/01-home-mobile.png`, fullPage: true });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, "no horizontal scroll at 390px");
  await m.goto("/services/m-check");
  assert(await seen(m.getByText("Үнийн мэдээллийг удахгүй")), "unapproved prices are not shown publicly");

  // --- Visitor fills the order, then registers ------------------------------
  const client = await ctx({ viewport: { width: 1280, height: 900 } });
  const c = await client.newPage();
  await c.goto("/order/m-check");
  await c.selectOption("#propertyType", "apartment");
  await c.selectOption("#district", "Хан-Уул");
  await c.fill("#khoroo", "11-р хороо");
  await c.fill("#address", "Зайсан, 15-р байр, 42 тоот");
  await c.fill("#areaSqm", "68.5");
  await c.fill("#rooms", "3");
  await c.fill("#askingPriceMnt", "420000000");
  await c.fill("#ownerName", "Дорж");
  await c.screenshot({ path: `${SHOTS}/02-order-form.png`, fullPage: true });
  await Promise.all([c.waitForURL(/\/register/), c.click("button[type=submit]")]);
  ok("unauthenticated submit sends visitor to registration");
  await c.fill("#fullName", "Тест Харилцагч");
  await c.fill("#email", `client${stamp}@test.mn`);
  await c.fill("#phone", "99112233");
  await c.fill("#password", "ClientPass123");
  await c.check("input[name=acceptTerms]");
  await Promise.all([c.waitForURL(/\/order\/m-check\?resume=1/), c.click("button[type=submit]")]);
  await c.waitForTimeout(300);
  assert((await c.inputValue("#address")).includes("15-р байр"), "draft is restored after registration");
  await Promise.all([c.waitForURL(/\/dashboard\/orders\/[0-9a-f-]+/), c.click("button[type=submit]")]);
  const orderUrl = new URL(c.url()).pathname;
  assert(await seen(c.getByText("Захиалга хадгалагдлаа")), "draft saved to database");
  assert(await seen(c.getByText("үнэ хараахан батлагдаагүй")), "submission blocked until prices are approved");

  // --- Super admin approves M CHECK prices --------------------------------
  const admin = await ctx({ viewport: { width: 1280, height: 900 } });
  const a = await admin.newPage();
  await login(a, "admin@m-advisory.local", undefined, "/admin/pricing");
  await a.goto("/admin/pricing");
  await a.getByRole("button", { name: /Бүх саналыг батлах \(21\)/ }).click();
  await a.waitForURL(/ok=1/);
  assert((await a.getByText("Батлагдсан").count()) >= 21, "admin approved the 21 M CHECK price rows");
  await a.screenshot({ path: `${SHOTS}/03-admin-pricing.png`, fullPage: true });

  // --- Client confirms and pays (mock) -------------------------------------
  await c.goto(orderUrl);
  assert(await seen(c.getByText("₮200,000").first()), "quote shows ₮200,000 (apartment < ₮500M)");
  await c.check("input[name=acceptTerms]");
  await Promise.all([c.waitForURL(/submitted=1/), c.getByRole("button", { name: "Захиалга баталгаажуулах" }).click()]);
  ok("order submitted, price frozen");
  await Promise.all([c.waitForURL(/pay=1/), c.getByRole("button", { name: "QPay-ээр төлөх" }).click()]);
  await c.screenshot({ path: `${SHOTS}/04-payment.png`, fullPage: true });
  await Promise.all([c.waitForURL(/paid=1/), c.getByRole("button", { name: "Туршилтын төлбөр хийх" }).click()]);
  assert(await seen(c.getByText("Төлбөр баталгаажлаа")), "payment verified through provider adapter");
  await c.screenshot({ path: `${SHOTS}/05-paid.png`, fullPage: true });

  // --- Another client cannot open it ----------------------------------------
  const intruder = await ctx();
  const i = await intruder.newPage();
  await i.goto("/register");
  await i.fill("#fullName", "Өөр Хүн");
  await i.fill("#email", `other${stamp}@test.mn`);
  await i.fill("#password", "OtherPass123");
  await i.check("input[name=acceptTerms]");
  await Promise.all([i.waitForURL(/\/dashboard/), i.click("button[type=submit]")]);
  const res = await i.goto(orderUrl);
  assert(res.status() === 404 && (await seen(i.getByText("Хуудас олдсонгүй"))), "another client gets 404 on the order URL");
  assert((await i.getByText("Зайсан").count()) === 0, "no order data leaks to the other client");
  const adminRes = await i.goto("/admin/orders");
  assert(new URL(i.url()).pathname === "/dashboard", "client is redirected away from /admin");

  // --- Admin assigns advisor + reviewer -----------------------------------
  const orderId = orderUrl.split("/").pop();
  await a.goto(`/admin/orders/${orderId}`);
  await a.selectOption("#advisor", { label: "Зөвлөх Бат" });
  await Promise.all([a.waitForURL(/ok=assigned/), a.getByRole("button", { name: "Зөвлөх томилох" }).click()]);
  await a.selectOption("#reviewer", { label: "Хянагч Сараа" });
  await Promise.all([a.waitForURL(/ok=assigned/), a.getByRole("button", { name: "Хянагч томилох" }).click()]);
  assert(await seen(a.getByText("Мэргэжилтэн хуваарилагдсан").first()), "order moved to assigned");
  await a.screenshot({ path: `${SHOTS}/06-admin-order.png`, fullPage: true });

  // --- Advisor starts work ------------------------------------------------
  const adv = await ctx();
  const v = await adv.newPage();
  await login(v, "advisor@m-advisory.local", undefined, "/admin/orders");
  await v.goto("/admin/orders");
  assert((await v.locator("tbody tr").count()) === 1, "advisor sees only the assigned order");
  await v.goto(`/admin/orders/${orderId}`);
  await v.selectOption("#to", "in_progress");
  await Promise.all([v.waitForURL(/ok=status/), v.getByRole("button", { name: "Хадгалах" }).click()]);
  assert(await seen(v.getByText("Гүйцэтгэж байна").first()), "advisor moved order to in progress");

  // --- Client sees progress and uploads a document ----------------------------
  await c.goto(orderUrl);
  assert(await seen(c.getByText("Гүйцэтгэж байна").first()), "client sees updated status");
  await c.setInputFiles("input[type=file]", { name: "гэрчилгээ.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
  await Promise.all([c.waitForURL(/uploaded=1/), c.getByRole("button", { name: "Байршуулах" }).click()]);
  assert(await seen(c.getByRole("link", { name: "гэрчилгээ.pdf" })), "client uploaded a document");
  const docHref = await c.getByRole("link", { name: "гэрчилгээ.pdf" }).getAttribute("href");
  const docRes = await i.request.get(docHref);
  assert(docRes.status() === 404, "another client cannot download the document");

  // --- Advisor writes and submits the report -----------------------------------
  await v.goto(`/admin/orders/${orderId}/report`);
  await v.fill("#es", "Өмчлөлийн баримт зөв. Банкны барьцаа илэрсэн тул худалдан авахаас өмнө чөлөөлүүлнэ.");
  await v.getByRole("button", { name: "+ Эрсдэл нэмэх" }).click();
  await v.getByLabel("Эрсдэлийн нэр").fill("Банкны барьцаа");
  await v.getByLabel("Түвшин").selectOption("high");
  await v.getByLabel("Нотлох эх сурвалж").last().fill("Улсын бүртгэлийн лавлагаа, 2026-11-02");
  await v.fill("#rec", "Барьцаа чөлөөлөгдсөний дараа гэрээ байгуулах.");
  await Promise.all([v.waitForURL(/ok=submitted/), v.getByRole("button", { name: "Хянуулахаар илгээх" }).click()]);
  assert(await seen(v.getByText("Тайлан хянагч руу илгээгдлээ")), "advisor submitted the report");
  await v.screenshot({ path: `${SHOTS}/08-report-editor.png`, fullPage: true });

  // --- Reviewer approves -> PDF published -> order completed --------------------
  const rev = await ctx();
  const r = await rev.newPage();
  await login(r, "reviewer@m-advisory.local", undefined, "/admin/reports");
  await r.goto(`/admin/orders/${orderId}/report`);
  await Promise.all([r.waitForURL(/ok=approved/), r.getByRole("button", { name: "Батлах ба нийтлэх" }).click()]);
  assert(await seen(r.getByText("PDF үүсч харилцагчид нийтлэгдлээ")), "reviewer approved and the PDF was published");

  await c.goto(orderUrl);
  assert(await seen(c.getByText("Дууссан").first()), "order is completed for the client");
  const pdfHref = await c.getByRole("link", { name: "PDF татах" }).first().getAttribute("href");
  const pdfRes = await c.request.get(pdfHref);
  const body = await pdfRes.body();
  assert(pdfRes.status() === 200 && body.subarray(0, 5).toString() === "%PDF-", "client downloaded the PDF report");
  assert((await i.request.get(pdfHref)).status() === 404, "another client cannot download the report");
  await c.locator("input[name=rating][value='5']").check();
  await Promise.all([c.waitForURL(/thanks=1/), c.getByRole("button", { name: "Илгээх" }).click()]);
  assert(await seen(c.getByText("Үнэлгээ өгсөнд баярлалаа")), "client rated the service");
  await c.screenshot({ path: `${SHOTS}/09-completed.png`, fullPage: true });
  await c.goto("/dashboard/notifications");
  assert(await seen(c.getByText("Таны тайлан бэлэн боллоо")), "client received the report notification");
  await a.goto("/admin");
  await a.screenshot({ path: `${SHOTS}/07-admin-dashboard.png`, fullPage: true });
  assert(await seen(a.getByText("₮200,000").first()), "dashboard revenue reflects the paid order");

  console.log(`\nALL ${steps.length} CHECKS PASSED`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
