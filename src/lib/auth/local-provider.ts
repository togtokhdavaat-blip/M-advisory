import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { asSystem } from "../db";
import { env, sessionSecret } from "../env";
import type { AuthProvider, AuthResult, RegisterInput, SessionUser } from "./types";

/**
 * DEVELOPMENT-ONLY auth provider. Stores bcrypt hashes in auth.users (the same
 * column Supabase uses) and keeps the session in a signed, httpOnly cookie.
 * env() refuses AUTH_PROVIDER=local when NODE_ENV=production.
 */
export const SESSION_COOKIE = "ma_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
// Compare against a real hash for unknown emails so response time does not
// reveal whether an account exists.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("not-a-real-password", 12));

async function issueSession(user: SessionUser) {
  const token = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setIssuer("m-advisory")
    .setAudience("m-advisory-web")
    .sign(sessionSecret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { issuer: "m-advisory", audience: "m-advisory-web" });
    if (!payload.sub) return null;
    return { id: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
  } catch {
    return null;
  }
}

export const localAuthProvider: AuthProvider = {
  async getUser() {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const user = await verifySessionToken(token);
    if (!user) return null;
    // Reject sessions of deleted users.
    const rows = await asSystem((tx) => tx`select id, email from auth.users where id = ${user.id}`);
    return rows.length ? { id: rows[0].id as string, email: (rows[0].email as string) ?? null } : null;
  },

  async signIn(email, password): Promise<AuthResult> {
    const rows = await asSystem(
      (tx) => tx`select id, email, encrypted_password from auth.users where lower(email) = lower(${email})`,
    );
    const row = rows[0];
    const ok = await bcrypt.compare(password, (row?.encrypted_password as string) ?? getDummyHash());
    if (!row || !ok) return { ok: false, error: "invalid_credentials" };
    await asSystem((tx) => tx`update auth.users set last_sign_in_at = now() where id = ${row.id}`);
    const user = { id: row.id as string, email: row.email as string };
    await issueSession(user);
    return { ok: true, user };
  },

  async register(input: RegisterInput): Promise<AuthResult> {
    const hash = await bcrypt.hash(input.password, 12);
    try {
      const rows = await asSystem(
        (tx) => tx`
          insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
          values (lower(${input.email}), ${hash}, now(),
                  ${tx.json({ full_name: input.fullName, phone: input.phone ?? null })})
          returning id, email`,
      );
      const user = { id: rows[0].id as string, email: rows[0].email as string };
      await issueSession(user);
      return { ok: true, user };
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "23505") {
        return { ok: false, error: "email_taken" };
      }
      throw e;
    }
  },

  async signOut() {
    (await cookies()).delete(SESSION_COOKIE);
  },
};
