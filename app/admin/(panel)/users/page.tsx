import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import {
  countUsersForAdmin,
  getUsersSummary,
  listUsersForAdmin,
  type AdminUserSort,
} from "@/lib/db";
import { formatPrice } from "@/lib/plans";

const PAGE_SIZE = 50;
const QUICK_AUTH_DOMAIN = "@razdevator.local";

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
}

export default async function AdminUsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  await requireAdmin();

  const params = await searchParams;
  const search = one(params.q)?.trim() || null;
  const sort: AdminUserSort = one(params.sort) === "created" ? "created" : "balance";
  const found = countUsersForAdmin(search);
  const pages = Math.max(1, Math.ceil(found / PAGE_SIZE));
  const requested = Number.parseInt(one(params.page) ?? "1", 10);
  const page = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), pages) : 1;

  const summary = getUsersSummary();
  const users = listUsersForAdmin({
    search,
    sort,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const href = (patch: { sort?: AdminUserSort; page?: number; q?: string | null }) => {
    const query = new URLSearchParams();
    const nextSearch = patch.q === undefined ? search : patch.q;
    if (nextSearch) query.set("q", nextSearch);
    const nextSort = patch.sort ?? sort;
    if (nextSort !== "balance") query.set("sort", nextSort);
    const nextPage = patch.page ?? 1;
    if (nextPage > 1) query.set("page", String(nextPage));
    const qs = query.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  const stats = [
    { label: "Пользователей", value: summary.total.toLocaleString("ru-RU") },
    { label: "Сумма балансов", value: formatPrice(summary.totalBalanceRub) },
    { label: "С ненулевым балансом", value: summary.withBalance.toLocaleString("ru-RU") },
  ];

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
        Пользователи
      </h1>

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-card border border-line bg-panel p-5">
            <dt className="text-xs font-medium text-muted">{stat.label}</dt>
            <dd className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form action="/admin/users" className="flex gap-2">
          {sort !== "balance" && <input type="hidden" name="sort" value={sort} />}
          <input
            type="search"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Поиск по email или логину"
            aria-label="Поиск по email или логину"
            className="h-10 w-full min-w-0 rounded-full border border-line bg-panel px-4 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none sm:w-72"
          />
          <button
            type="submit"
            className="h-10 shrink-0 rounded-full border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
          >
            Найти
          </button>
        </form>

        <div className="flex items-center gap-1 text-sm">
          <span className="mr-1 text-faint">Сортировка:</span>
          {(
            [
              { value: "balance", label: "по балансу" },
              { value: "created", label: "по дате" },
            ] as const
          ).map((option) => (
            <Link
              key={option.value}
              href={href({ sort: option.value })}
              aria-current={sort === option.value ? "true" : undefined}
              className="inline-flex h-8 items-center rounded-full px-3 font-medium text-muted transition-colors hover:text-ink aria-[current=true]:bg-brand-soft aria-[current=true]:text-ink"
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      {search && (
        <p className="mt-3 text-xs text-muted">
          Найдено: {found.toLocaleString("ru-RU")} ·{" "}
          <Link href={href({ q: null })} className="underline hover:text-ink">
            сбросить поиск
          </Link>
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-elevated text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Пользователь</th>
              <th className="px-4 py-3 text-right font-medium">Баланс</th>
              <th className="px-4 py-3 text-right font-medium">Генераций</th>
              <th className="px-4 py-3 text-right font-medium">Оплачено</th>
              <th className="px-4 py-3 font-medium">Регистрация</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((user) => {
              const quick = user.email.endsWith(QUICK_AUTH_DOMAIN);
              return (
                <tr key={user.id} className="bg-panel">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink">
                        {quick ? user.name : user.email}
                      </span>
                      {quick && (
                        <span className="shrink-0 rounded-full border border-line-strong px-1.5 py-px text-[10px] font-semibold text-muted">
                          быстрый вход
                        </span>
                      )}
                    </div>
                    {!quick && user.name && (
                      <div className="truncate text-xs text-faint">{user.name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink tabular-nums">
                    {formatPrice(user.balanceRub)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted tabular-nums">
                    {user.generationsUsed.toLocaleString("ru-RU")}
                  </td>
                  <td className="px-4 py-3 text-right text-muted tabular-nums">
                    {user.paidRub > 0 ? formatPrice(user.paidRub) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted tabular-nums">
                    {formatDate(user.createdAt)}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr className="bg-panel">
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  {search ? "Никого не нашли" : "Пользователей пока нет"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label="Страницы" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="font-medium text-muted hover:text-ink">
              ← Назад
            </Link>
          ) : (
            <span />
          )}
          <span className="text-faint">
            Страница {page} из {pages}
          </span>
          {page < pages ? (
            <Link href={href({ page: page + 1 })} className="font-medium text-muted hover:text-ink">
              Вперёд →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
