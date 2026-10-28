/**
 * Выбор активного провайдера и резервной цепочки.
 *
 * Настройки лежат в `app_setting` и читаются на каждый запрос, поэтому
 * переключение из админки действует сразу, без рестарта:
 * - `payment.provider.site` — активный для сайта;
 * - `payment.provider.project.<id>` — для внешнего проекта (пусто — наследует сайт);
 * - `payment.fallback` — "1" (по умолчанию) пробовать следующего или "0" — только активный.
 */

import { getAppSettings, setAppSetting } from "./db";
import type { ResolvedProvider } from "./payment-provider";
import { getProvider, listAvailableProviders } from "./payment-provider-registry";

export type PaymentScope =
  | { service: "site" }
  | { service: "project"; projectId: string };

export interface ProviderChain {
  providers: ResolvedProvider[];
  activeId: string | null;
  /** Выбранный провайдер реально доступен (или выбор не задан). */
  activeAvailable: boolean;
}

export function providerSettingKey(scope: PaymentScope): string {
  return scope.service === "site"
    ? "payment.provider.site"
    : `payment.provider.project.${scope.projectId}`;
}

/** Собственный выбор scope (без наследования). */
export function getOwnProviderId(scope: PaymentScope): string | null {
  const settings = getAppSettings();
  return settings[providerSettingKey(scope)]?.trim() || null;
}

/** Эффективный выбор: у проекта — свой, иначе общий сайтовый. */
export function getActiveProviderId(scope: PaymentScope): string | null {
  if (scope.service === "project") {
    const own = getOwnProviderId(scope);
    if (own) return own;
  }
  return getOwnProviderId({ service: "site" });
}

/** Пустая строка очищает выбор — scope вернётся к значению по умолчанию. */
export function setActiveProviderId(
  scope: PaymentScope,
  providerId: string | null,
): void {
  setAppSetting(providerSettingKey(scope), providerId ?? "");
}

export function fallbackEnabled(): boolean {
  return getAppSettings()["payment.fallback"] !== "0";
}

export function setFallbackEnabled(enabled: boolean): void {
  setAppSetting("payment.fallback", enabled ? "1" : "0");
}

/**
 * Цепочка провайдеров для новых счетов. Активный идёт первым, дальше — все
 * доступные по sortOrder. Если фолбэк выключен, остаётся только первый.
 */
export function resolveProviderChain(scope: PaymentScope): ProviderChain {
  const available = listAvailableProviders();
  const selected = getActiveProviderId(scope);
  const fallback = fallbackEnabled();
  const active = selected
    ? (available.find((provider) => provider.id === selected) ?? null)
    : null;
  const defaultProvider =
    available.find((provider) => provider.id === "exenta") ?? available[0] ?? null;

  const first =
    active ??
    (selected
      ? fallback
        ? (available[0] ?? null)
        : null
      : defaultProvider);

  if (!first) {
    return { providers: [], activeId: selected, activeAvailable: false };
  }

  const providers = fallback
    ? [first, ...available.filter((provider) => provider.id !== first.id)]
    : [first];

  return {
    providers,
    activeId: selected,
    activeAvailable: selected === null || active !== null,
  };
}

export interface EffectiveProvider {
  provider: ResolvedProvider | null;
  /** Для проекта: выбор не задан, используется настройка сайта. */
  inherited: boolean;
  ownId: string | null;
}

/** Что реально применится к scope — для отображения в админке. */
export function getEffectiveProvider(scope: PaymentScope): EffectiveProvider {
  const ownId = getOwnProviderId(scope);
  if (ownId) {
    const provider = getProvider(ownId);
    if (provider) return { provider, inherited: false, ownId };
  }
  if (scope.service === "project") {
    const siteId = getOwnProviderId({ service: "site" });
    if (siteId) {
      const provider = getProvider(siteId);
      if (provider) return { provider, inherited: true, ownId };
    }
  }
  const chain = resolveProviderChain(scope);
  return {
    provider: chain.providers[0] ?? null,
    inherited: scope.service === "project",
    ownId,
  };
}
