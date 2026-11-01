import { z } from "zod";

export const PASSWORD_MIN = 10;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Имэйл хаяг буруу байна").max(200),
  password: z.string().min(1, "Нууц үгээ оруулна уу").max(200),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Овог нэрээ оруулна уу").max(200),
  email: z.string().trim().toLowerCase().email("Имэйл хаяг буруу байна").max(200),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => v === "" || /^\+?[0-9]{8,15}$/.test(v), "Утасны дугаар буруу байна")
    .optional(),
  password: z
    .string()
    .min(PASSWORD_MIN, `Нууц үг дор хаяж ${PASSWORD_MIN} тэмдэгт байна`)
    .max(200)
    .refine((v) => /[A-Za-zА-Яа-яӨөҮүЁё]/.test(v) && /[0-9]/.test(v), "Үсэг болон тоо агуулсан байна"),
  acceptTerms: z.literal("on", { error: "Үйлчилгээний нөхцөл, нууцлалын бодлогыг зөвшөөрнө үү" }),
});

export type FieldErrors = Partial<Record<string, string>>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const k = String(issue.path[0] ?? "form");
    out[k] ??= issue.message;
  }
  return out;
}
