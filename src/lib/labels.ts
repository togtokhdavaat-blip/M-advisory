import type { OrderStatus } from "./orders/state-machine";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Ноорог",
  awaiting_payment: "Төлбөр хүлээгдэж байна",
  paid: "Төлөгдсөн",
  assigned: "Мэргэжилтэн хуваарилагдсан",
  in_progress: "Гүйцэтгэж байна",
  needs_information: "Нэмэлт мэдээлэл хэрэгтэй",
  under_review: "Хяналтад байна",
  revision_requested: "Засвар хүссэн",
  completed: "Дууссан",
  cancelled: "Цуцлагдсан",
};

export type Tone = "neutral" | "accent" | "warn" | "good" | "bad";
export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  draft: "neutral",
  awaiting_payment: "warn",
  paid: "accent",
  assigned: "accent",
  in_progress: "accent",
  needs_information: "warn",
  under_review: "accent",
  revision_requested: "warn",
  completed: "good",
  cancelled: "bad",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Хүлээгдэж байна",
  paid: "Төлөгдсөн",
  failed: "Амжилтгүй",
  expired: "Хугацаа дууссан",
  cancelled: "Цуцлагдсан",
  refund_pending: "Буцаалт хүлээгдэж байна",
  refunded: "Буцаагдсан",
};

export const PROPERTY_TYPES = [
  "apartment",
  "new_project",
  "house",
  "land",
  "office",
  "retail",
  "commercial_object",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  apartment: "Орон сууц (ашиглалтад орсон)",
  new_project: "Шинэ төсөл",
  house: "Хаус, таунхаус",
  land: "Газар",
  office: "Оффис",
  retail: "Худалдаа, үйлчилгээний талбай",
  commercial_object: "Объект (бүтэн барилга г.м.)",
};

export const PARTY_ROLE_LABEL: Record<string, string> = {
  owner: "Өмчлөгч",
  seller: "Худалдагч",
  buyer: "Худалдан авагч",
  representative: "Төлөөлөгч",
  developer: "Барилгын компани",
};

export const ROLE_LABEL: Record<string, string> = {
  CLIENT: "Харилцагч",
  ADVISOR: "Зөвлөх",
  REVIEWER: "Хянагч",
  BRANCH_ADMIN: "Салбарын админ",
  SUPER_ADMIN: "Ерөнхий админ",
};

export const UB_DISTRICTS = [
  "Баянгол",
  "Баянзүрх",
  "Сонгинохайрхан",
  "Сүхбаатар",
  "Хан-Уул",
  "Чингэлтэй",
  "Налайх",
  "Багануур",
  "Багахангай",
] as const;
