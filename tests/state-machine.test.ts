import { afterAll, describe, expect, it } from "vitest";
import { ORDER_STATUSES, ORDER_TRANSITIONS, canTransition, nextStatuses } from "@/lib/orders/state-machine";
import { owner } from "./helpers/db";

afterAll(() => owner.end());

describe("order state machine", () => {
  it("TypeScript mirror matches app.order_transition_rules exactly", async () => {
    const rows = await owner`select from_status, to_status, actor from app.order_transition_rules`;
    const db = rows.map((r) => `${r.from_status}>${r.to_status}>${r.actor}`).sort();
    const ts = ORDER_TRANSITIONS.map(([f, t, a]) => `${f}>${t}>${a}`).sort();
    expect(ts).toEqual(db);
  });

  it("TypeScript status list matches the database enum", async () => {
    const rows = await owner`select unnest(enum_range(null::order_status))::text as s`;
    expect(rows.map((r) => r.s)).toEqual([...ORDER_STATUSES]);
  });

  it("only the system can mark paid or completed", () => {
    for (const actor of ["client", "advisor", "reviewer", "admin"] as const) {
      expect(canTransition("awaiting_payment", "paid", [actor])).toBe(false);
      expect(canTransition("under_review", "completed", [actor])).toBe(false);
    }
    expect(canTransition("awaiting_payment", "paid", ["system"])).toBe(true);
  });

  it("terminal states have no exits", () => {
    expect(nextStatuses("completed", ["client", "advisor", "reviewer", "admin", "system"])).toEqual([]);
    expect(nextStatuses("cancelled", ["client", "advisor", "reviewer", "admin", "system"])).toEqual([]);
  });
});
