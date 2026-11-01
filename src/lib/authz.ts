import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSessionUser, type SessionUser } from "./auth";
import { asUser } from "./db";

export type AppRole = "CLIENT" | "ADVISOR" | "REVIEWER" | "BRANCH_ADMIN" | "SUPER_ADMIN";
export const STAFF_ROLES: AppRole[] = ["ADVISOR", "REVIEWER", "BRANCH_ADMIN", "SUPER_ADMIN"];

export interface Membership {
  id: string;
  role: AppRole;
  branchId: string | null;
  branchName: string | null;
}

export interface Access {
  user: SessionUser;
  fullName: string;
  memberships: Membership[];
  roles: Set<AppRole>;
  isStaff: boolean;
  isSuperAdmin: boolean;
  /** Branches where the user is BRANCH_ADMIN (all branches for SUPER_ADMIN is handled by isSuperAdmin). */
  adminBranchIds: string[];
}

/**
 * Loads the user's memberships through RLS (the user can only read their own).
 * UI uses this to decide what to show; the database re-checks every action.
 */
export const getAccess = cache(async (): Promise<Access | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const { rows, profile } = await asUser(user, async (tx) => {
    const rows = await tx`
      select m.id, m.role, m.branch_id, b.name as branch_name
      from memberships m left join branches b on b.id = m.branch_id
      where m.user_id = ${user.id} and m.is_active`;
    const profile = await tx`select full_name from profiles where id = ${user.id}`;
    return { rows, profile };
  });
  const memberships: Membership[] = rows.map((r) => ({
    id: r.id as string,
    role: r.role as AppRole,
    branchId: (r.branch_id as string) ?? null,
    branchName: (r.branch_name as string) ?? null,
  }));
  const roles = new Set(memberships.map((m) => m.role));
  return {
    user,
    fullName: (profile[0]?.full_name as string) || user.email || "",
    memberships,
    roles,
    isStaff: STAFF_ROLES.some((r) => roles.has(r)),
    isSuperAdmin: roles.has("SUPER_ADMIN"),
    adminBranchIds: memberships.filter((m) => m.role === "BRANCH_ADMIN" && m.branchId).map((m) => m.branchId!),
  };
});

export async function requireUser(next?: string): Promise<Access> {
  const access = await getAccess();
  if (!access) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return access;
}

export async function requireStaff(next = "/admin"): Promise<Access> {
  const access = await requireUser(next);
  if (!access.isStaff) redirect("/dashboard");
  return access;
}

export async function requireAdmin(next = "/admin"): Promise<Access> {
  const access = await requireUser(next);
  if (!access.isSuperAdmin && access.adminBranchIds.length === 0) redirect(access.isStaff ? "/admin" : "/dashboard");
  return access;
}

export async function requireSuperAdmin(next = "/admin"): Promise<Access> {
  const access = await requireUser(next);
  if (!access.isSuperAdmin) redirect(access.isStaff ? "/admin" : "/dashboard");
  return access;
}

/** Only allow same-site relative redirects after login. */
export function safeNext(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
