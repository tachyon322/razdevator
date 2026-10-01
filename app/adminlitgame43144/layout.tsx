import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Админка — Раздеватор",
  robots: { index: false, follow: false },
};

/**
 * Админка заперта паролем из `ADMIN_PASSWORD`, а в образ она собирается без
 * `.env` — при статической генерации проверка сразу отдала бы 404 и он бы
 * закрепился в сборке. Рендерим на каждый запрос.
 */
export const dynamic = "force-dynamic";

export default function AdminRootLayout({ children }: LayoutProps<"/adminlitgame43144">) {
  return children;
}
