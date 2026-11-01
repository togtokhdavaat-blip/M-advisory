import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env";
import type { AuthProvider, AuthResult } from "./types";

/**
 * Production auth: Supabase Auth with cookie-based sessions (@supabase/ssr).
 * getUser() re-validates the JWT with the Auth server on every call, so a
 * forged or revoked cookie is never trusted.
 */
async function client() {
  const store = await cookies();
  const e = env();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL!, e.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

export const supabaseAuthProvider: AuthProvider = {
  async getUser() {
    const supabase = await client();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },

  async signIn(email, password): Promise<AuthResult> {
    const supabase = await client();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return { ok: false, error: error?.status === 429 ? "rate_limited" : "invalid_credentials" };
    }
    return { ok: true, user: { id: data.user.id, email: data.user.email ?? null } };
  },

  async register(input): Promise<AuthResult> {
    const supabase = await client();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName, phone: input.phone ?? null },
        emailRedirectTo: `${env().APP_URL}/auth/callback`,
      },
    });
    if (error || !data.user) {
      if (error?.code === "user_already_exists") return { ok: false, error: "email_taken" };
      if (error?.code === "weak_password") return { ok: false, error: "weak_password" };
      if (error?.status === 429) return { ok: false, error: "rate_limited" };
      return { ok: false, error: "unknown" };
    }
    return {
      ok: true,
      user: { id: data.user.id, email: data.user.email ?? null },
      needsEmailConfirmation: !data.session,
    };
  },

  async signOut() {
    const supabase = await client();
    await supabase.auth.signOut();
  },
};
