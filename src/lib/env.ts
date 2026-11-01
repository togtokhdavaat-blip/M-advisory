import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated once at startup. Nothing here is ever
 * sent to the browser (only NEXT_PUBLIC_* values are, and none are secret).
 */
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Deployment tier. NODE_ENV is "production" for every `next build`, so the
    // dev-only adapters are gated on this instead (and on Vercel's own flag).
    APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    VERCEL_ENV: z.string().optional(),
    APP_URL: z.string().url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5432/m_advisory"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

    // "local" = dev-only email+password store in auth.users (bcrypt) + signed cookie.
    // "supabase" = Supabase Auth (production).
    AUTH_PROVIDER: z.enum(["local", "supabase"]).default("local"),
    SESSION_SECRET: z.string().min(32).optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

    // "mock" is refused in production. "qpay" needs merchant credentials.
    PAYMENT_PROVIDER: z.enum(["mock", "qpay"]).default("mock"),
    QPAY_BASE_URL: z.string().url().default("https://merchant-sandbox.qpay.mn"),
    QPAY_USERNAME: z.string().optional(),
    QPAY_PASSWORD: z.string().optional(),
    QPAY_INVOICE_CODE: z.string().optional(),
    QPAY_CALLBACK_SECRET: z.string().min(16).optional(),

    STORAGE_PROVIDER: z.enum(["local", "supabase"]).default("local"),
    LOCAL_STORAGE_DIR: z.string().default(".data/storage"),
  })
  .superRefine((env, ctx) => {
    const prod = isProductionTier(env);
    if (prod && env.AUTH_PROVIDER === "local") {
      ctx.addIssue({ code: "custom", path: ["AUTH_PROVIDER"], message: "local auth is development-only" });
    }
    if (prod && env.PAYMENT_PROVIDER === "mock") {
      ctx.addIssue({ code: "custom", path: ["PAYMENT_PROVIDER"], message: "mock payments are not allowed in production" });
    }
    if (prod && env.STORAGE_PROVIDER === "local") {
      ctx.addIssue({ code: "custom", path: ["STORAGE_PROVIDER"], message: "local file storage is development-only" });
    }
    if (env.AUTH_PROVIDER === "local" && !env.SESSION_SECRET && env.NODE_ENV === "production") {
      ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "required outside `next dev`" });
    }
    if (env.AUTH_PROVIDER === "supabase" || env.STORAGE_PROVIDER === "supabase") {
      for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
        if (!env[k]) ctx.addIssue({ code: "custom", path: [k], message: "required for Supabase" });
      }
    }
    if (env.PAYMENT_PROVIDER === "qpay") {
      for (const k of ["QPAY_USERNAME", "QPAY_PASSWORD", "QPAY_INVOICE_CODE", "QPAY_CALLBACK_SECRET"] as const) {
        if (!env[k]) ctx.addIssue({ code: "custom", path: [k], message: "required for QPay" });
      }
    }
  });

export type Env = z.infer<typeof schema>;

function isProductionTier(e: { APP_ENV: string; VERCEL_ENV?: string }) {
  return e.APP_ENV === "production" || e.VERCEL_ENV === "production";
}

/** True on the live production deployment. Dev-only adapters refuse to run here. */
export function isProduction(): boolean {
  return isProductionTier(env());
}

let cached: Env | undefined;
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment: ${msg}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Dev fallback secret so `npm run dev` works out of the box. Never used in production (validated above). */
export function sessionSecret(): Uint8Array {
  const s = env().SESSION_SECRET ?? "dev-only-insecure-session-secret-change-me-0123456789";
  return new TextEncoder().encode(s);
}
