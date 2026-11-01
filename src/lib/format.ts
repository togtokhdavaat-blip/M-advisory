const mnt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatMnt(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return `₮${mnt.format(amount)}`;
}

export function formatDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}
