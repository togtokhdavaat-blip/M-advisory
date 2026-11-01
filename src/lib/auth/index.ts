import "server-only";
import { cache } from "react";
import { env } from "../env";
import { localAuthProvider } from "./local-provider";
import { supabaseAuthProvider } from "./supabase-provider";
import type { AuthProvider } from "./types";

export function authProvider(): AuthProvider {
  return env().AUTH_PROVIDER === "supabase" ? supabaseAuthProvider : localAuthProvider;
}

/** Current user for this request (memoised per render). */
export const getSessionUser = cache(() => authProvider().getUser());

export type { SessionUser } from "./types";
