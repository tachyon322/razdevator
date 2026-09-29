import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserUsage } from "@/lib/db";
import { PRICES, formatPrice } from "@/lib/plans";
import { SignOutButton } from "../../components/SignOutButton";
import { ArrowRightIcon, BoltIcon, ImageIcon } from "../../components/icons";

export const metadata = {
  title: "Профиль — Раздеватор",
};

function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const user = session.user;
  const label = user.name || user.email;
  const initial = label.trim().charAt(0).toUpperCase();

  const usage = getUserUsage(user.id);
  const used = usage?.generationsUsed ?? 0;
  const balance = usage?.balanceRub ?? 0;

  const createdAt = formatDate(user.createdAt);

  return (
    <main className="flex-1 py-14 sm:py-20">
      <div className="container-page max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 rounded-panel border border-line bg-panel p-6 sm:gap-5 sm:p-7">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] font-display text-xl font-bold text-white">
            {initial}
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-extrabold tracking-tight text-ink">
              {label}
            </h1>
            <p className="truncate text-sm text-muted">{user.email}</p>
            {createdAt && (
              <p className="mt-1 text-xs text-faint">С нами с {createdAt}</p>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {/* Оплата */}
          <div className="flex flex-col rounded-card border border-line bg-panel p-6">
            <span className="text-sm font-medium text-muted">Оплата</span>
            <p className="mt-3 font-display text-2xl font-extrabold tracking-tight text-ink">
              {formatPrice(PRICES.image)}{" "}
              <span className="text-base font-semibold text-muted">за фото</span>
            </p>
            <p className="mt-1 text-sm text-faint">
              Видео — {formatPrice(PRICES.video)} за ролик
            </p>

            <p className="mt-3 text-sm text-muted">
              Баланс:{" "}
              <span className="font-semibold text-ink">
                {formatPrice(balance)}
              </span>
            </p>

            <p className="mt-4 flex-1 text-sm text-muted">
              Лимитов нет: каждая генерация списывается с баланса. Пополнить
              баланс можно кнопкой с кошельком в шапке.
            </p>

            <Link
              href="/pricing"
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
            >
              Цены и пакеты
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>

          {/* Статистика */}
          <div className="flex flex-col rounded-card border border-line bg-panel p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted">Статистика</span>
              <BoltIcon className="size-5 text-brand" />
            </div>

            <p className="mt-3 font-display text-2xl font-extrabold tracking-tight text-ink">
              {used}
            </p>
            <p className="mt-1 text-sm text-faint">генераций выполнено</p>

            <p className="mt-4 flex-1 text-sm text-muted">
              Счётчик нужен только для статистики: он ничего не ограничивает —
              платите за каждую выполненную генерацию.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-card border border-line bg-panel p-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-ink">Аккаунт</p>
            <p className="mt-1 text-sm text-muted">
              Выйти на этом устройстве или удалить аккаунт со всеми данными.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/gallery"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
            >
              <ImageIcon className="size-4" />
              Моя галерея
            </Link>
            <SignOutButton />
            <button
              type="button"
              disabled
              title="Скоро"
              className="inline-flex h-11 cursor-not-allowed items-center justify-center rounded-full border border-line px-6 text-sm font-semibold text-faint opacity-60"
            >
              Удалить аккаунт
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
