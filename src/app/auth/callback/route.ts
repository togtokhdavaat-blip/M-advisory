import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/authz";
import { env } from "@/lib/env";

/** Supabase email-confirmation / magic-link landing: exchange the code for a session. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (env().AUTH_PROVIDER !== "supabase" || !code) return NextResponse.redirect(new URL("/login", req.url));
  const store = await cookies();
  const supabase = createServerClient(env().NEXT_PUBLIC_SUPABASE_URL!, env().NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: (l) => l.forEach(({ name, value, options }) => store.set(name, value, options)) },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? "/login?error=confirm" : next, req.url));
}
