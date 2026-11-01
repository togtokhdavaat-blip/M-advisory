/**
 * Mirror of app.order_transition_rules (supabase/migrations/..._order_workflow.sql).
 * The database is authoritative; this copy drives which buttons the UI shows.
 * tests/state-machine.test.ts asserts the two are identical.
 */
export const ORDER_STATUSES = [
  "draft",
  "awaiting_payment",
  "paid",
  "assigned",
  "in_progress",
  "needs_information",
  "under_review",
  "revision_requested",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Actor = "client" | "advisor" | "reviewer" | "admin" | "system";

export const ORDER_TRANSITIONS: ReadonlyArray<readonly [OrderStatus, OrderStatus, Actor]> = [
  ["draft", "awaiting_payment", "client"],
  ["draft", "cancelled", "client"],
  ["draft", "cancelled", "admin"],
  ["awaiting_payment", "draft", "client"],
  ["awaiting_payment", "paid", "system"],
  ["awaiting_payment", "cancelled", "client"],
  ["awaiting_payment", "cancelled", "admin"],
  ["paid", "assigned", "admin"],
  ["paid", "cancelled", "admin"],
  ["assigned", "in_progress", "advisor"],
  ["assigned", "in_progress", "admin"],
  ["assigned", "cancelled", "admin"],
  ["in_progress", "needs_information", "advisor"],
  ["in_progress", "under_review", "advisor"],
  ["in_progress", "cancelled", "admin"],
  ["needs_information", "in_progress", "advisor"],
  ["needs_information", "in_progress", "client"],
  ["needs_information", "cancelled", "admin"],
  ["under_review", "revision_requested", "reviewer"],
  ["under_review", "cancelled", "admin"],
  ["revision_requested", "cancelled", "admin"],
  ["under_review", "completed", "system"],
  ["revision_requested", "under_review", "advisor"],
  ["revision_requested", "in_progress", "advisor"],
];

export function canTransition(from: OrderStatus, to: OrderStatus, actors: readonly Actor[]): boolean {
  return ORDER_TRANSITIONS.some(([f, t, a]) => f === from && t === to && actors.includes(a));
}

export function nextStatuses(from: OrderStatus, actors: readonly Actor[]): OrderStatus[] {
  return [...new Set(ORDER_TRANSITIONS.filter(([f, , a]) => f === from && actors.includes(a)).map(([, t]) => t))];
}

/** Client-facing progress steps (auxiliary states map onto the main line). */
export const CLIENT_STEPS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "draft", label: "Захиалга", statuses: ["draft"] },
  { key: "payment", label: "Төлбөр", statuses: ["awaiting_payment"] },
  { key: "work", label: "Шалгалт хийгдэж байна", statuses: ["paid", "assigned", "in_progress", "needs_information"] },
  { key: "review", label: "Тайлан хянагдаж байна", statuses: ["under_review", "revision_requested"] },
  { key: "done", label: "Тайлан бэлэн", statuses: ["completed"] },
];
