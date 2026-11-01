import { describe, expect, it } from "vitest";
import { orderDraftSchema, toDbPayload } from "@/lib/validation/order";
import { registerSchema } from "@/lib/validation/auth";
import { formatMnt } from "@/lib/format";

vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
import { vi } from "vitest";
const { safeNext } = await import("@/lib/authz");

const base = { propertyType: "apartment", address: "Хан-Уул, 11-р хороо, 15-р байр", askingPriceMnt: "350,000,000", clientIsBuyer: "on" };

describe("order draft validation", () => {
  it("accepts a minimal valid apartment and normalises the price", () => {
    const r = orderDraftSchema.parse(base);
    expect(r.askingPriceMnt).toBe(350000000);
    expect(r.clientIsBuyer).toBe(true);
  });

  it("requires a project name for new projects and a buyer when the client is not the buyer", () => {
    const r = orderDraftSchema.safeParse({ ...base, propertyType: "new_project", clientIsBuyer: undefined });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toContain("projectName");
    expect(paths).toContain("buyerName");
  });

  it("rejects unknown property types, javascript: links and bad numbers", () => {
    expect(orderDraftSchema.safeParse({ ...base, propertyType: "castle" }).success).toBe(false);
    expect(orderDraftSchema.safeParse({ ...base, listingUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(orderDraftSchema.safeParse({ ...base, areaSqm: "-4" }).success).toBe(false);
    expect(orderDraftSchema.safeParse({ ...base, askingPriceMnt: "1.5e9" }).success).toBe(false);
  });

  it("models owner, buyer and client as separate parties", () => {
    const v = orderDraftSchema.parse({ ...base, clientIsBuyer: undefined, buyerName: "Бат", ownerName: "Дорж" });
    const { parties } = toDbPayload(v, "Захиалагч Нэр");
    expect(parties).toEqual([
      { party_role: "owner", full_name: "Дорж", phone: "", is_client: false },
      { party_role: "buyer", full_name: "Бат", is_client: false },
    ]);
  });
});

describe("registration validation", () => {
  const ok = { fullName: "Бат Болд", email: "Bat@Example.MN ", phone: "9911 2233", password: "Securepass1", acceptTerms: "on" };
  it("normalises email and phone", () => {
    const r = registerSchema.parse(ok);
    expect(r.email).toBe("bat@example.mn");
    expect(r.phone).toBe("99112233");
  });
  it("requires consent and a reasonable password", () => {
    expect(registerSchema.safeParse({ ...ok, acceptTerms: undefined }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, password: "short1" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, password: "onlyletterslong" }).success).toBe(false);
  });
});

describe("safe redirects", () => {
  it("allows only same-site relative paths", () => {
    expect(safeNext("/dashboard/orders")).toBe("/dashboard/orders");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("/\\evil.example")).toBe("/dashboard");
    expect(safeNext(undefined)).toBe("/dashboard");
  });
});

describe("money formatting", () => {
  it("formats whole tugrik", () => {
    expect(formatMnt(1250000)).toBe("₮1,250,000");
    expect(formatMnt(null)).toBe("—");
  });
});
