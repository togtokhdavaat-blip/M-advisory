/**
 * LOCAL ONLY: create demo staff accounts for the local auth provider.
 *   npm run db:seed-dev
 * Password for every account: DevPassword123  (change nothing in production —
 * this script refuses non-local databases).
 */
import bcrypt from "bcryptjs";
import postgres from "postgres";

const url = new URL(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/m_advisory");
if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
  console.error("Refusing to seed a non-local database.");
  process.exit(1);
}

const USERS = [
  { email: "admin@m-advisory.local", name: "Ерөнхий Админ", roles: [["SUPER_ADMIN", null]] },
  { email: "branch1@m-advisory.local", name: "Салбар 1 Админ", roles: [["BRANCH_ADMIN", "UB1"]] },
  { email: "advisor@m-advisory.local", name: "Зөвлөх Бат", roles: [["ADVISOR", "UB1"]] },
  { email: "reviewer@m-advisory.local", name: "Хянагч Сараа", roles: [["REVIEWER", "UB1"]] },
] as const;

async function main() {
  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  const hash = await bcrypt.hash("DevPassword123", 12);
  for (const u of USERS) {
    const rows = await sql`
      insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
      values (${u.email}, ${hash}, now(), ${sql.json({ full_name: u.name })})
      on conflict (email) do update set encrypted_password = excluded.encrypted_password
      returning id`;
    for (const [role, branch] of u.roles) {
      await sql`insert into memberships (user_id, role, branch_id)
                values (${rows[0].id}, ${role}::app_role, (select id from branches where code = ${branch}))
                on conflict do nothing`;
    }
    console.log(`${u.email}  ${u.roles.map((r) => r.join("@")).join(", ")}`);
  }
  console.log("\nPassword for all: DevPassword123");
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
