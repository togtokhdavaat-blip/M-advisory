import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Tone } from "@/lib/labels";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Container({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("mx-auto w-full max-w-6xl px-4 sm:px-6", className)} {...p} />;
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const btn: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
  ghost: "text-accent hover:bg-accent-soft",
  danger: "bg-bad text-white hover:opacity-90",
};
const btnBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(btnBase, btn[variant], className)} {...p} />;
}

export function ButtonLink({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(btnBase, btn[variant], className)} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-line bg-surface p-5 sm:p-6", className)} {...p} />;
}

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  accent: "bg-accent-soft text-accent border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  good: "bg-good-soft text-good border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
};
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function Alert({ tone = "accent", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("rounded-lg border px-4 py-3 text-sm", tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-brass">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{title}</h1>
        {description && <div className="mt-2 max-w-2xl text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const inputBase =
  "w-full min-h-11 rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 aria-[invalid=true]:border-bad";

export function Field({
  label, name, hint, error, required, children,
}: { label: string; name: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label} {required && <span className="text-bad" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p id={`${name}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${name}-error`} className="text-xs font-medium text-bad">{error}</p>}
    </div>
  );
}

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(inputBase, className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cx(inputBase, "pr-8", className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputBase, "min-h-28", className)} {...p} />;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <span aria-hidden className="grid size-8 place-items-center rounded-md bg-accent font-display text-sm font-bold text-accent-ink">M</span>
      <span className="leading-none">
        <span className="block font-display text-sm font-semibold tracking-[0.12em]">M ADVISORY</span>
        <span className="block text-[10px] uppercase tracking-[0.18em] text-muted">by M Properties</span>
      </span>
    </span>
  );
}
