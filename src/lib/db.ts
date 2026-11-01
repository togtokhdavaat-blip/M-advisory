import "server-only";
import postgres from "postgres";
import { env } from "./env";

/**
 * Database access.
 *
 * The server connects with the database owner role, but every request made on
 * behalf of a user runs inside a transaction that switches to the
 * `authenticated` (or `anon`) role and sets `request.jwt.claims` — exactly how
 * Supabase evaluates Row Level Security. So RLS is the enforcement layer for
 * reads, and SECURITY DEFINER functions in schema `app` enforce writes. The
 * TypeScript checks in the app are a second line, never the only one.
 *
 * `asSystem` (no role switch, bypasses RLS) is reserved for verified payment
 * webhooks, background jobs and the auth bootstrap.
 */
type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

const globalForDb = globalThis as unknown as { __mAdvisorySql?: Sql };

export function sql(): Sql {
  if (!globalForDb.__mAdvisorySql) {
    globalForDb.__mAdvisorySql = postgres(env().DATABASE_URL, {
      max: env().DATABASE_POOL_MAX,
      idle_timeout: 20,
      prepare: false, // compatible with Supabase's transaction pooler
      onnotice: () => {},
      // int8 → number. Money is whole MNT, far below Number.MAX_SAFE_INTEGER.
      types: { int8: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
    });
  }
  return globalForDb.__mAdvisorySql;
}

export interface DbUser {
  id: string;
  email?: string | null;
}

export async function asUser<T>(user: DbUser, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: user.id, role: "authenticated", email: user.email ?? undefined });
  return sql().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('role', 'authenticated', true)`;
    return fn(tx);
  }) as Promise<T>;
}

export async function asAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('role', 'anon', true)`;
    return fn(tx);
  }) as Promise<T>;
}

export async function asSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql().begin((tx) => fn(tx)) as Promise<T>;
}

/** Postgres error → stable application error code (raised by app.* functions). */
export function dbErrorCode(e: unknown): string | null {
  if (e && typeof e === "object" && "message" in e) {
    const m = String((e as { message: string }).message);
    const code = m.split(":")[0]?.trim();
    if (code && /^[a-z_]+$/.test(code)) return code;
  }
  return null;
}
