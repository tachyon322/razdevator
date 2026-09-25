import Link from "next/link";
import { Logo } from "./Logo";

const NAV = [
  { href: "/#how", label: "Как это работает" },
  { href: "/pricing", label: "Тарифы" },
  { href: "/#privacy", label: "Приватность" },
  { href: "/faq", label: "FAQ" },
  { href: "#terms", label: "Правила" },
  { href: "#support", label: "Поддержка" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-elevated/60 py-12">
      <div className="container-page">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              AI-сервис для создания вымышленных изображений. Только для
              совершеннолетних.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint">
            © {year} Раздеватор. Все изображения вымышлены.
          </p>
          <span className="inline-flex w-fit items-center rounded-full border border-line-strong px-2.5 py-1 text-[11px] font-semibold text-muted">
            18+ только для взрослых
          </span>
        </div>
      </div>
    </footer>
  );
}
