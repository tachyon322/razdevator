"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Витрина" },
  { href: "/admin/users", label: "Пользователи" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-muted transition-colors hover:text-ink aria-[current=page]:bg-brand-soft aria-[current=page]:text-ink"
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
