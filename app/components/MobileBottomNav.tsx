"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Headphones, House, Images, Tag, type LucideIcon } from "lucide-react";

interface BottomNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Путь, совпадение с которым подсвечивает пункт */
  match: string;
}

const LEFT_ITEMS: BottomNavItem[] = [
  { href: "/", label: "Главная", icon: House, match: "/" },
  { href: "/pricing", label: "Цены", icon: Tag, match: "/pricing" },
];

const RIGHT_ITEMS: BottomNavItem[] = [
  { href: "/gallery", label: "Галерея", icon: Images, match: "/gallery" },
  { href: "/support", label: "Помощь", icon: Headphones, match: "/support" },
];

const CREATE_ITEM = { href: "/create", label: "Создать", icon: Camera };

/**
 * Нижняя плавающая плашка навигации для смартфонов: 2 ссылки + круглая
 * «Создать» + 2 ссылки. Геометрия повторяет kazik/front/components/MobileNav.tsx,
 * цвета — из токенов проекта. На планшетах и десктопе скрыта (там верхнее меню).
 */
export function MobileBottomNav() {
  const pathname = usePathname();

  const isActive = (match: string) =>
    match === "/" ? pathname === "/" : pathname.startsWith(match);

  const renderItem = ({ href, label, icon: Icon, match }: BottomNavItem) => {
    const active = isActive(match);

    return (
      <Link
        key={href}
        href={href}
        data-active={active}
        aria-current={active ? "page" : undefined}
        className="grid min-h-[54px] min-w-0 place-items-center content-center gap-[3px] rounded-[11px] text-[10px] font-semibold text-faint transition-colors hover:text-muted data-[active=true]:bg-brand-soft data-[active=true]:text-ink"
      >
        <Icon className="size-[19px]" strokeWidth={1.7} aria-hidden="true" />
        <span>{label}</span>
      </Link>
    );
  };

  const CreateIcon = CREATE_ITEM.icon;
  const createActive = isActive(CREATE_ITEM.href);

  return (
    <>
      {/* Клиренс, чтобы плашка не перекрывала низ страницы и футер */}
      <div
        aria-hidden
        className="h-[calc(6.5rem_+_env(safe-area-inset-bottom,0px))] lg:hidden"
      />

      <nav
        aria-label="Быстрая навигация"
        className="fixed inset-x-2 bottom-[calc(7px_+_env(safe-area-inset-bottom,0px))] z-30 grid min-h-[63px] grid-cols-5 rounded-[17px] border border-line-strong bg-elevated/95 p-[5px_4px] shadow-[0_18px_45px_rgba(0,0,0,0.48)] backdrop-blur-xl lg:hidden"
      >
        {LEFT_ITEMS.map(renderItem)}

        <Link
          href={CREATE_ITEM.href}
          aria-current={createActive ? "page" : undefined}
          aria-label="Создать фото"
          className="grid min-w-0 place-items-center content-end gap-[2px] text-[9px] font-semibold text-ink"
        >
          <span
            aria-hidden="true"
            className="mt-[-20px] grid size-[51px] place-items-center rounded-full border-4 border-canvas bg-[linear-gradient(145deg,#e11d48,#9f1239)] text-white shadow-[0_0_25px_rgba(225,29,72,0.35)]"
          >
            <CreateIcon className="size-[21px]" strokeWidth={1.9} />
          </span>
          <strong className="font-semibold">{CREATE_ITEM.label}</strong>
        </Link>

        {RIGHT_ITEMS.map(renderItem)}
      </nav>
    </>
  );
}
