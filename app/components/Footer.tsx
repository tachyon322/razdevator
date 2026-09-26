import Link from "next/link";
import { Logo } from "./Logo";
import { SUPPORT_EMAIL, SUPPORT_TELEGRAM } from "@/lib/support";

const SERVICE_NAV = [
  { href: "/#how", label: "Как это работает" },
  { href: "/gallery", label: "Галерея" },
  { href: "/pricing", label: "Тарифы" },
  { href: "/faq", label: "FAQ" },
];

const DOCS_NAV = [
  { href: "/privacy", label: "Политика конфиденциальности" },
  { href: "/terms", label: "Пользовательское соглашение" },
  { href: "/support", label: "Поддержка" },
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

          <div className="grid gap-8 sm:grid-cols-2 sm:gap-x-14">
            <nav aria-label="Сервис">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
                Сервис
              </h2>
              <ul className="mt-4 flex flex-col gap-3 text-sm">
                {SERVICE_NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-muted transition-colors hover:text-ink"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Документы">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
                Документы
              </h2>
              <ul className="mt-4 flex flex-col gap-3 text-sm">
                {DOCS_NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-muted transition-colors hover:text-ink"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint">
            © {year} Раздеватор. Все изображения вымышлены.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-xs text-muted transition-colors hover:text-ink"
            >
              {SUPPORT_EMAIL}
            </a>
            {SUPPORT_TELEGRAM && (
              <a
                href={`https://t.me/${SUPPORT_TELEGRAM}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted transition-colors hover:text-ink"
              >
                @{SUPPORT_TELEGRAM}
              </a>
            )}
            <span className="inline-flex w-fit items-center rounded-full border border-line-strong px-2.5 py-1 text-[11px] font-semibold text-muted">
              PlaVER
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
