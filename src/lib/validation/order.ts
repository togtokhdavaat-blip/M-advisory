import { z } from "zod";
import { PROPERTY_TYPES } from "../labels";

const optText = (max: number) =>
  z.string().trim().max(max, `${max} тэмдэгтээс ихгүй`).optional().transform((v) => (v ? v : undefined));

const optInt = (min: number, max: number, msg: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/[\s,₮]/g, "") : undefined))
    .refine((v) => v === undefined || (/^-?\d+$/.test(v) && Number(v) >= min && Number(v) <= max), msg)
    .transform((v) => (v === undefined ? undefined : Number(v)));

export const orderDraftSchema = z
  .object({
    orderId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    propertyType: z.enum(PROPERTY_TYPES, { error: "Хөрөнгийн төрлөө сонгоно уу" }),
    district: optText(80),
    khoroo: optText(80),
    address: z.string().trim().min(5, "Хаягаа дэлгэрэнгүй бичнэ үү").max(500),
    projectName: optText(200),
    areaSqm: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v.replace(",", ".") : undefined))
      .refine((v) => v === undefined || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) < 1_000_000), "Талбайг м²-аар зөв оруулна уу"),
    rooms: optInt(0, 100, "Өрөөний тоо буруу"),
    floor: optInt(-5, 200, "Давхар буруу"),
    buildYear: optInt(1900, 2100, "Он буруу"),
    registrationNumber: optText(64),
    cadastralNumber: optText(64),
    askingPriceMnt: optInt(1, 1_000_000_000_000, "Үнийг төгрөгөөр, зөвхөн тоогоор оруулна уу"),
    listingUrl: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || /^https?:\/\/\S+$/.test(v), "Линк http(s)://-ээр эхэлнэ"),
    ownerName: optText(200),
    ownerPhone: optText(32),
    clientIsBuyer: z.string().optional().transform((v) => v === "on"),
    buyerName: optText(200),
    notes: optText(4000),
  })
  .superRefine((v, ctx) => {
    if (v.propertyType === "new_project" && !v.projectName) {
      ctx.addIssue({ code: "custom", path: ["projectName"], message: "Төслийн нэрийг оруулна уу" });
    }
    if (!v.askingPriceMnt) {
      ctx.addIssue({ code: "custom", path: ["askingPriceMnt"], message: "Үнийн дүн хөлсийг тооцоход шаардлагатай" });
    }
    if (!v.clientIsBuyer && !v.buyerName) {
      ctx.addIssue({ code: "custom", path: ["buyerName"], message: "Худалдан авагчийн нэрийг оруулна уу" });
    }
  });

export type OrderDraftInput = z.infer<typeof orderDraftSchema>;

/** Shape expected by app.create_order_draft / app.update_order_draft. */
export function toDbPayload(v: OrderDraftInput, clientName: string) {
  const property = {
    property_type: v.propertyType,
    title: v.projectName ?? v.address.slice(0, 120),
    district: v.district ?? "",
    khoroo: v.khoroo ?? "",
    address: v.address,
    project_name: v.projectName ?? "",
    area_sqm: v.areaSqm ?? "",
    rooms: v.rooms ?? "",
    floor: v.floor ?? "",
    build_year: v.buildYear ?? "",
    registration_number: v.registrationNumber ?? "",
    cadastral_number: v.cadastralNumber ?? "",
    asking_price_mnt: v.askingPriceMnt ?? "",
    listing_url: v.listingUrl ?? "",
    notes: "",
  };
  const parties: Record<string, unknown>[] = [];
  if (v.ownerName) parties.push({ party_role: "owner", full_name: v.ownerName, phone: v.ownerPhone ?? "", is_client: false });
  parties.push(
    v.clientIsBuyer
      ? { party_role: "buyer", full_name: clientName || "Захиалагч", is_client: true }
      : { party_role: "buyer", full_name: v.buyerName, is_client: false },
  );
  return { property, parties };
}
