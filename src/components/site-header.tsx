import Link from "next/link";
import { getAccess } from "@/lib/authz";
import { asUser } from "@/lib/db";
import { Container, Logo } from "./ui";

export async function SiteHeader() {
  const access = await getAccess();
  const unread = access
    ? ((await asUser(access.user, (tx) => tx`select count(*)::int as n from notifications where user_id = ${access.user.id} and read_at is null`))[0].n as number)
    : 0;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="M ADVISORY нүүр хуудас"><Logo /></Link>
        <nav aria-label="Үндсэн цэс" className="flex items-center gap-1 text-sm sm:gap-2">
          <Link href="/services" className="rounded-md px-3 py-2 font-medium hover:bg-surface">Үйлчилгээ</Link>
          {access ? (
            <>
              {access.isStaff && <Link href="/admin" className="hidden rounded-md px-3 py-2 font-medium hover:bg-surface sm:inline-block">Ажлын самбар</Link>}
              <Link href="/dashboard/notifications" aria-label={`Мэдэгдэл${unread ? `, ${unread} шинэ` : ""}`} className="relative rounded-md px-3 py-2 hover:bg-surface">
                <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
              </Link>
              <Link href="/dashboard" className="rounded-md bg-accent px-3 py-2 font-semibold text-accent-ink hover:opacity-90">Миний самбар</Link>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-md px-3 py-2 font-medium hover:bg-surface">Нэвтрэх</Link>
              <Link href="/register" className="hidden rounded-md bg-accent px-3 py-2 font-semibold text-accent-ink hover:opacity-90 sm:inline-block">Бүртгүүлэх</Link>
            </>
          )}
        </nav>
      </Container>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <Container className="flex flex-col gap-6 py-10 text-sm text-muted sm:flex-row sm:justify-between">
        <div className="space-y-2">
          <Logo />
          <p className="font-display text-xs tracking-[0.2em] text-brass">TRUST CREATES VALUE.</p>
        </div>
        <div className="space-y-1 sm:text-right">
          <p>Үйлчилгээ үзүүлэгч: Симкас Пропертиз ХХК (брэнд нэр: M Properties)</p>
          <p>Улаанбаатар, Монгол Улс</p>
          <p>© {new Date().getFullYear()} M Properties</p>
        </div>
      </Container>
    </footer>
  );
}
