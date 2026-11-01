import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before matched routes. With Supabase Auth it refreshes the session
 * cookie (required by @supabase/ssr). It is NOT the authorization layer:
 * pages re-check access on the server and the database enforces RLS.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (process.env.AUTH_PROVIDER !== "supabase") return response;

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/payments/callback|api/health).*)"],
};
