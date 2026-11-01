/**
 * LOCAL ONLY: recreate the development database and apply the Supabase shim
 * plus every migration in order. Refuses to run against anything that is not
 * localhost.
 *
 *   npm run db:reset            # uses DATABASE_URL (default postgres://postgres:postgres@localhost:5432/m_advisory)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = new URL(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/m_advisory");
if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
  console.error(`Refusing to reset non-local database host: ${url.hostname}`);
  process.exit(1);
}
const dbName = url.pathname.slice(1);
const admin = new URL(url);
admin.pathname = "/postgres";

async function main() {
  const root = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  await root.unsafe(`drop database if exists "${dbName}" with (force)`);
  await root.unsafe(`create database "${dbName}"`);
  await root.end();

  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  const files = [
    join("supabase", "local", "00_supabase_shim.sql"),
    ...readdirSync(join("supabase", "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => join("supabase", "migrations", f)),
  ];
  for (const f of files) {
    process.stdout.write(`apply ${f} ... `);
    await sql.unsafe(readFileSync(f, "utf8"));
    console.log("ok");
  }
  await sql.end();
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
