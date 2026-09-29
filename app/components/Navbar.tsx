"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { AuthButtons } from "./AuthButtons";
import { BalanceButton, MobileBalance } from "./BalanceButton";
import { CloseIcon, MenuIcon } from "./icons";

const NAV = [
  { href: "/#how", label: "Как это работает" },
  { href: "/pricing", label: "Цены", match: "/pricing" },
  { href: "/#privacy", label: "Приватность" },
  { href: "/gallery", label: "Галерея", match: "/gallery" },
];

/** В бургер-меню FAQ остаётся доступным, даже когда его нет в верхнем меню. */
const MENU_NAV = [
  { href: "/#how", label: "Как это работает" },
  { href: "/pricing", label: "Цены", match: "/pricing" },
  { href: "/#privacy", label: "Приватность" },
  { href: "/faq", label: "FAQ", match: "/faq" },
];

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  // Меню привязано к маршруту: при клиентской навигации layout не
  // размонтируется, поэтому «открыто» = совпадение маршрута с тем, на котором
  // меню открыли. Так меню закрывается само, без setState внутри эффекта.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const toggleMenu = () => setOpenPath(open ? null : pathname);
  const closeMenu = () => setOpenPath(null);

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

        <div className="flex items-center gap-2">
          {/* Мобильный баланс — вплотную слева от бургер-меню */}
          <MobileBalance />

          <div className="hidden lg:flex items-center gap-2">
            <BalanceButton />
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
            onClick={toggleMenu}
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={open}
            className="grid size-11 place-items-center rounded-tile border border-line text-ink transition-colors hover:bg-panel-hover lg:hidden"
          >
            {open ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden">
          <div className="container-page flex flex-col gap-1 border-t border-line py-4">
            {MENU_NAV.map((item) => {
              const active = item.match === pathname;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
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
                onClick={closeMenu}
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
