"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { AuthButtons } from "./AuthButtons";
import { CloseIcon, MenuIcon } from "./icons";

const NAV = [
  { href: "/#how", label: "Как это работает" },
  { href: "/pricing", label: "Тарифы", match: "/pricing" },
  { href: "/#privacy", label: "Приватность" },
  { href: "/faq", label: "FAQ", match: "/faq" },
];

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <header
      className={[
        "sticky top-0 z-40 w-full border-b transition-colors duration-200",
        scrolled || open
          ? "border-line bg-elevated/80 backdrop-blur-xl"
          : "border-transparent bg-canvas/40 backdrop-blur-md",
      ].join(" ")}
    >
      <div className="container-page flex h-[72px] items-center justify-between gap-4">
        <Logo />

        <nav className="hidden lg:flex items-center gap-1" aria-label="Основная навигация">
          {NAV.map((item) => {
            const active = item.match === pathname;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "rounded-full px-3.5 py-2 text-sm font-medium transition-colors hover:bg-panel-hover hover:text-ink",
                  active ? "text-ink" : "text-muted",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden lg:flex items-center gap-2">
          <AuthButtons />
          <Link
            href="/create"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-5 text-sm font-semibold text-white shadow-[0_10px_34px_-12px_rgba(225,29,72,0.8)] transition-transform hover:-translate-y-0.5"
          >
            Создать фото
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={open}
          className="grid size-11 place-items-center rounded-tile border border-line text-ink transition-colors hover:bg-panel-hover lg:hidden"
        >
          {open ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden">
          <div className="container-page flex flex-col gap-1 border-t border-line py-4">
            {NAV.map((item) => {
              const active = item.match === pathname;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "rounded-tile px-3 py-3 text-base font-medium transition-colors hover:bg-panel-hover hover:text-ink",
                    active ? "text-ink" : "text-muted",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="mt-3 flex flex-col gap-2">
              <AuthButtons variant="mobile" />
              <Link
                href="/create"
                onClick={() => setOpen(false)}
                className="grid h-12 place-items-center rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] text-sm font-semibold text-white shadow-[0_10px_34px_-12px_rgba(225,29,72,0.8)]"
              >
                Создать фото
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
