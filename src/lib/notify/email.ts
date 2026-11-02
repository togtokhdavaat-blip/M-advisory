import "server-only";
import { asSystem } from "../db";
import { env } from "../env";

/**
 * E-mail delivery for in-app notifications (transactional outbox).
 * Uses Resend's HTTP API when RESEND_API_KEY is set; otherwise notifications
 * stay in-app only and are marked as "no provider" so the queue does not grow.
 */
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function dispatchEmails(limit = 50): Promise<{ sent: number; failed: number; skipped: number }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "M ADVISORY <no-reply@mproperties.mn>";
  const rows = await asSystem((tx) => tx`
    select n.id, n.title, n.body, n.link, p.email, p.full_name
    from notifications n join profiles p on p.id = n.user_id
    where n.emailed_at is null and n.created_at > now() - interval '3 days'
    order by n.created_at limit ${limit}
    for update of n skip locked`);
  const out = { sent: 0, failed: 0, skipped: 0 };
  for (const n of rows) {
    if (!key || !n.email) {
      await asSystem((tx) => tx`update notifications set emailed_at = now(), email_error = 'no_provider' where id = ${n.id}`);
      out.skipped++;
      continue;
    }
    const link = n.link ? `${env().APP_URL}${n.link}` : env().APP_URL;
    const html = `<div style="font-family:Arial,sans-serif;color:#17232b;max-width:560px">
      <p style="font-weight:bold;letter-spacing:2px;color:#1d4e5f">M ADVISORY</p>
      <p>Сайн байна уу${n.full_name ? `, ${escapeHtml(String(n.full_name))}` : ""}.</p>
      <p style="font-size:16px;font-weight:bold">${escapeHtml(String(n.title))}</p>
      <p>${escapeHtml(String(n.body ?? ""))}</p>
      <p><a href="${escapeHtml(link)}" style="background:#1d4e5f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Дэлгэрэнгүй үзэх</a></p>
      <p style="color:#5b6871;font-size:12px">Симкас Пропертиз ХХК (M Properties) · Энэ имэйлд хариу бичих шаардлагагүй.</p></div>`;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `notification-${n.id}` },
        body: JSON.stringify({ from, to: [n.email], subject: `M ADVISORY · ${n.title}`, html }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`resend_${res.status}`);
      await asSystem((tx) => tx`update notifications set emailed_at = now(), email_error = null where id = ${n.id}`);
      out.sent++;
    } catch (e) {
      await asSystem((tx) => tx`update notifications set email_error = ${String((e as Error).message).slice(0, 200)} where id = ${n.id}`);
      out.failed++;
    }
  }
  return out;
}
