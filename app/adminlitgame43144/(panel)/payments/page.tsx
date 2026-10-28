import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin";
import { listRecentPayments } from "@/lib/db";
import { getGatewayProject, listGatewayProjectIds } from "@/lib/gateway";
import { formatPrice } from "@/lib/plans";
import {
  listAvailableProviders,
  listProviders,
  toProviderInfo,
} from "@/lib/payment-provider-registry";
import {
  fallbackEnabled,
  getEffectiveProvider,
  getOwnProviderId,
  resolveProviderChain,
  type PaymentScope,
} from "@/lib/payment-settings";
import {
  exentaWebhookUrl,
  providerWebhookUrl,
  publicBaseIsHttps,
  publicBaseUrl,
} from "@/lib/site-url";
import { toggleProvider } from "./actions";
import { CopyButton } from "./CopyButton";
import { FallbackToggle } from "./FallbackToggle";
import { ProviderSwitch, type ProviderOption } from "./ProviderSwitch";

export const dynamic = "force-dynamic";

const PAYMENTS_PATH = "/adminlitgame43144/payments";

interface ScopeView {
  scopeKey: string;
  title: string;
  description: string;
  emptyLabel: string;
  options: ProviderOption[];
  ownId: string | null;
  effectiveId: string | null;
  effectiveName: string | null;
  inherited: boolean;
  chainNames: string[];
  activeUnavailable: boolean;
  hasProviders: boolean;
}

function buildScopeView(
  scope: PaymentScope,
  title: string,
  description: string,
  emptyLabel: string,
  options: ProviderOption[],
): ScopeView {
  const chain = resolveProviderChain(scope);
  const effective = getEffectiveProvider(scope);
  const ownId = getOwnProviderId(scope);
  return {
    scopeKey: scope.service === "site" ? "site" : `project:${scope.projectId}`,
    title,
    description,
    emptyLabel,
    options,
    ownId,
    effectiveId: effective.provider?.id ?? null,
    effectiveName: effective.provider?.name ?? null,
    inherited: effective.inherited,
    chainNames: chain.providers.map((provider) => provider.name),
    activeUnavailable: chain.activeId !== null && !chain.activeAvailable,
    hasProviders: chain.providers.length > 0,
  };
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

type BadgeTone = "muted" | "success" | "danger" | "brand";

const BADGE_TONES: Record<BadgeTone, string> = {
  muted: "border-line-strong text-muted",
  success: "border-success text-success",
  danger: "border-danger text-danger",
  brand: "border-brand text-brand",
};

function Badge({ tone = "muted", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

function statusTone(status: string): string {
  switch (status) {
    case "SUCCESS":
    case "PAID":
      return "text-success";
    case "FAILED":
    case "CANCELLED":
    case "CANCELED":
      return "text-danger";
    case "PENDING":
      return "text-ink";
    default:
      return "text-muted";
  }
}

export default async function AdminPaymentsPage() {
  await requireAdmin();

  const providers = listProviders();
  const providerInfos = providers.map(toProviderInfo);
  const availableProviders = listAvailableProviders();
  const availableIds = new Set(availableProviders.map((provider) => provider.id));

  const options: ProviderOption[] = providerInfos.map((provider) => ({
    id: provider.id,
    name: provider.name,
    available: availableIds.has(provider.id),
  }));

  const projectIds = listGatewayProjectIds();
  const scopeViews: ScopeView[] = [
    buildScopeView(
      { service: "site" },
      "Сайт",
      "Пополнение баланса на сайте neuromatic.",
      "Автоматически — Exenta или первый доступный",
      options,
    ),
    ...projectIds.map((projectId) => {
      const project = getGatewayProject(projectId);
      const description = project
        ? `Внешний проект: ${project.description}.`
        : "Проект включён в GATEWAY_PROJECTS, но секрет не задан — счета не создадутся.";
      return buildScopeView(
        { service: "project", projectId },
        `Проект ${projectId}`,
        description,
        "Как на сайте (наследовать)",
        options,
      );
    }),
  ];

  const siteView = scopeViews[0];
  const fallback = fallbackEnabled();
  const recentPayments = listRecentPayments(20);

  const warnings: { title: string; text: string }[] = [];
  if (providers.length === 0) {
    warnings.push({
      title: "Платёжные провайдеры не настроены",
      text: "Нет ни встроенной Exenta (ключи PAYMENTS_PUBLIC_KEY и PAYMENTS_SECRET_KEY в env), ни HTTP-провайдеров в базе. Новые счета создать нельзя — добавьте провайдера ниже.",
    });
  } else if (availableProviders.length === 0) {
    warnings.push({
      title: "Нет доступных провайдеров",
      text: "Все провайдеры выключены или их конфиг не проходит проверку. Новые счета не создаются, пока хотя бы один не станет доступным.",
    });
  }
  if (siteView.activeUnavailable) {
    warnings.push({
      title: "Активный провайдер для сайта недоступен",
      text: `Выбран «${siteView.ownId}», но он выключен или его конфиг повреждён. ${
        fallback
          ? "Пока работает резервная цепочка, счета уйдут следующему доступному провайдеру."
          : "Резервная цепочка выключена — счета не создаются."
      }`,
    });
  }
  if (!publicBaseIsHttps()) {
    warnings.push({
      title: "BETTER_AUTH_URL не на https",
      text: `Сейчас: ${publicBaseUrl()}. Внешние провайдеры принимают callback_url только на публичном HTTPS (обычно порт 443), поэтому вебхуки и возврат покупателя могут не работать. Для локальной разработки есть PAYMENT_PROVIDER_ALLOW_HTTP=1, но реальные вебхуки требуют публичный HTTPS.`,
    });
  }

  const activeFor = (providerId: string): string[] =>
    scopeViews
      .filter((view) => view.ownId === providerId)
      .map((view) => view.title);
  const defaultFor = (providerId: string): string[] =>
    scopeViews
      .filter((view) => view.ownId === null && view.effectiveId === providerId)
      .map((view) => view.title);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Платежи
          </h1>
          <p className="mt-2 text-sm text-muted">
            Активные провайдеры для сайта и проектов, резервная цепочка и последние счета.
          </p>
        </div>
        <Link
          href={`${PAYMENTS_PATH}/new`}
          className="inline-flex h-10 items-center rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Добавить провайдера
        </Link>
      </div>

      {warnings.length > 0 && (
        <ul className="mt-6 flex flex-col gap-2">
          {warnings.map((warning) => (
            <li
              key={warning.title}
              className="rounded-card border border-line-strong bg-brand-soft p-4"
            >
              <p className="text-sm font-semibold text-ink">{warning.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{warning.text}</p>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-ink">
              Активные провайдеры
            </h2>
            <p className="mt-1 text-sm text-muted">
              Выбор применяется сразу, без перезапуска.
            </p>
          </div>
          <div className="flex items-center gap-4 rounded-card border border-line bg-panel px-4 py-3">
            <div className="max-w-[16rem]">
              <p className="text-sm font-semibold text-ink">Резервная цепочка</p>
              <p className="mt-0.5 text-xs leading-5 text-muted">
                Если провайдер не ответил — пробовать следующего по порядку.
              </p>
            </div>
            <FallbackToggle enabled={fallback} />
          </div>
        </div>

        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {scopeViews.map((view) => (
            <li
              key={view.scopeKey}
              className="flex flex-col rounded-card border border-line bg-panel p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-ink">{view.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted">{view.description}</p>
                </div>
                <ProviderSwitch
                  scopeKey={view.scopeKey}
                  value={view.ownId ?? ""}
                  options={view.options}
                  emptyLabel={view.emptyLabel}
                />
              </div>

              <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-faint">Сейчас применяется</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {view.effectiveName ?? "—"}
                    {view.inherited && view.effectiveName ? " (наследует)" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint">Цепочка</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {view.chainNames.length > 0 ? view.chainNames.join(" → ") : "—"}
                  </dd>
                </div>
              </dl>

              {view.activeUnavailable && (
                <p className="mt-3 rounded-tile border border-line-strong bg-brand-soft p-3 text-xs leading-5 text-ink">
                  Выбранный провайдер «{view.ownId}» недоступен: он выключен или конфиг
                  не проходит проверку. Выберите другого или сбросьте на автоматический.
                </p>
              )}
              {!view.hasProviders && (
                <p className="mt-3 rounded-tile border border-line-strong bg-brand-soft p-3 text-xs leading-5 text-ink">
                  Нет ни одного доступного провайдера — счета этого раздела не создаются.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-ink">
              Провайдеры
            </h2>
            <p className="mt-1 text-sm text-muted">
              Выключение убирает провайдера из новых счетов; старые счета продолжают
              сверяться через сохранённый providerId.
            </p>
          </div>
        </div>

        {providerInfos.length === 0 ? (
          <div className="mt-4 rounded-card border border-line bg-panel p-6">
            <p className="text-sm text-ink">Провайдеров пока нет.</p>
            <p className="mt-2 text-xs leading-5 text-muted">
              Встроенная Exenta включается ключами в env, а HTTP-провайдера
              (Cashera, Monee) можно добавить формой — пресет заполнит конфиг за вас.
            </p>
            <Link
              href={`${PAYMENTS_PATH}/new`}
              className="mt-4 inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-xs font-semibold text-ink transition-colors hover:bg-panel-hover"
            >
              Добавить провайдера
            </Link>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {providerInfos.map((provider) => {
              const isExenta = provider.kind === "exenta";
              const webhookUrl = isExenta
                ? exentaWebhookUrl()
                : providerWebhookUrl(provider.id);
              const activeLabels = activeFor(provider.id);
              const defaultLabels = defaultFor(provider.id);

              return (
                <li
                  key={provider.id}
                  className="rounded-card border border-line bg-panel p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink">{provider.name}</h3>
                        <Badge>{isExenta ? "встроенный · env" : "HTTP"}</Badge>
                        {provider.enabled ? (
                          <Badge tone="success">включён</Badge>
                        ) : (
                          <Badge>выключен</Badge>
                        )}
                        {!provider.configured && <Badge tone="danger">конфиг с ошибкой</Badge>}
                        {activeLabels.length > 0 && (
                          <Badge tone="brand">активен: {activeLabels.join(", ")}</Badge>
                        )}
                        {defaultLabels.length > 0 && (
                          <Badge>по умолчанию: {defaultLabels.join(", ")}</Badge>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-xs text-faint">
                        {provider.id} · sortOrder {provider.sortOrder}
                      </p>
                    </div>

                    {isExenta ? (
                      <span className="text-xs text-faint">
                        только env, в админке не меняется
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`${PAYMENTS_PATH}/${provider.id}`}
                          className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-xs font-semibold text-ink transition-colors hover:bg-panel-hover"
                        >
                          Изменить
                        </Link>
                        <form action={toggleProvider}>
                          <input type="hidden" name="id" value={provider.id} />
                          <input
                            type="hidden"
                            name="enabled"
                            value={provider.enabled ? "0" : "1"}
                          />
                          <button
                            type="submit"
                            className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-xs font-semibold text-muted transition-colors hover:text-ink"
                          >
                            {provider.enabled ? "Выключить" : "Включить"}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 rounded-tile border border-line bg-elevated px-3 py-2">
                    <span className="text-[11px] font-medium text-faint">webhook</span>
                    <code className="min-w-0 flex-1 break-all font-mono text-xs text-muted">
                      {webhookUrl}
                    </code>
                    <CopyButton text={webhookUrl} />
                  </div>

                  {isExenta && (
                    <p className="mt-2 text-xs leading-5 text-faint">
                      Exenta — встроенный провайдер: ключи читаются из env
                      (PAYMENTS_PUBLIC_KEY, PAYMENTS_SECRET_KEY), поэтому в админке он
                      только отображается. Его адрес вебхука — старый
                      /api/payments/webhook, менять его в кабинете Exenta не нужно.
                    </p>
                  )}
                  {!isExenta && !provider.configured && (
                    <p className="mt-2 text-xs leading-5 text-danger">
                      Конфиг не проходит проверку: провайдер не участвует в новых счетах.
                      Откройте «Изменить» и исправьте ошибки.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">
          Последние счета
        </h2>
        <p className="mt-1 text-sm text-muted">
          Проверка, что новые счета уходят через выбранного провайдера. Показаны
          последние {recentPayments.length} записей сайта и шлюза.
        </p>

        <div className="mt-4 overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-elevated text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Счёт</th>
                <th className="px-4 py-3 font-medium">Где</th>
                <th className="px-4 py-3 font-medium">Провайдер</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 text-right font-medium">Сумма</th>
                <th className="px-4 py-3 font-medium">Создан</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recentPayments.map((payment) => (
                <tr key={`${payment.kind}:${payment.id}`} className="bg-panel">
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {payment.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {payment.kind === "site" ? "Сайт" : "Шлюз"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink">
                    {payment.providerId ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      title={payment.providerStatus ?? undefined}
                      className={`inline-flex rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-semibold ${statusTone(payment.status)}`}
                    >
                      {payment.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink tabular-nums">
                    {formatPrice(payment.amountRub)}
                  </td>
                  <td className="px-4 py-3 text-muted tabular-nums">
                    {formatDate(payment.createdAt)}
                  </td>
                </tr>
              ))}
              {recentPayments.length === 0 && (
                <tr className="bg-panel">
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    Счетов пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
