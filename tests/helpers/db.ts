import postgres from "postgres";

export const url = process.env.DATABASE_URL!;
export const owner = postgres(url, {
  max: 4,
  onnotice: () => {},
  types: { int8: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
});

export type Tx = postgres.TransactionSql;

/** Run as an authenticated user exactly as the app does (role switch + JWT claims). */
export function as<T>(userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return owner.begin(async (tx) => {
    if (userId) {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true), set_config('role', 'authenticated', true)`;
    } else {
      await tx`select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('role', 'anon', true)`;
    }
    return fn(tx);
  }) as Promise<T>;
}

export async function createUser(email: string, fullName: string): Promise<string> {
  const r = await owner`insert into auth.users (email, raw_user_meta_data) values (${email}, ${owner.json({ full_name: fullName })}) returning id`;
  return r[0].id as string;
}

export async function grant(userId: string, role: string, branchCode: string | null) {
  await owner`insert into memberships (user_id, role, branch_id)
              values (${userId}, ${role}::app_role, (select id from branches where code = ${branchCode}))`;
}

/** Expect a promise to reject with a message containing `fragment`. */
export async function rejects(p: Promise<unknown>, fragment: string) {
  try {
    await p;
  } catch (e) {
    const m = String((e as Error).message);
    if (!m.includes(fragment)) throw new Error(`expected error containing "${fragment}", got "${m}"`);
    return;
  }
  throw new Error(`expected rejection containing "${fragment}", but it resolved`);
}
