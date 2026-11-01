"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export function SideNav({ items, label }: { items: { href: string; label: string; exact?: boolean }[]; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {items.map((i) => {
          const active = i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`);
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={active ? "page" : undefined}
                className={cx("block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium", active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface hover:text-ink")}>
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
