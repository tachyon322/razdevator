import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { logout } from "../actions";
import { AdminNav } from "./AdminNav";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-elevated">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-display text-base font-bold tracking-tight text-ink">
              Админка
            </Link>
            <AdminNav />
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="hidden h-9 items-center rounded-full px-3 text-sm font-medium text-muted transition-colors hover:text-ink sm:inline-flex"
            >
              На сайт
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
              >
                Выйти
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 py-8 sm:py-10">
        <div className="container-page">{children}</div>
      </main>
    </div>
  );
}
