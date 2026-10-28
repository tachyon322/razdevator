/**
 * Реестр платёжных провайдеров: встроенная Exenta из env + HTTP-провайдеры
 * из `payment_provider`. Возвращает готовые к использованию конфиги (с
 * расшифрованными секретами), поэтому модуль только серверный.
 *
 * Выключенные провайдеры тоже отдаются: по ним нужно сверять счета,
 * выставленные до переключения.
 */

import {
  getPaymentProviderRow,
  listPaymentProviderRows,
  type PaymentProviderRow,
} from "./db";
import {
  parseStoredConfig,
  type HttpProviderConfig,
  type ProviderInfo,
  type ResolvedProvider,
} from "./payment-provider";

/** Встроенная Exenta: включается наличием ключей в env. */
function exentaProvider(): ResolvedProvider | null {
  if (!process.env.PAYMENTS_PUBLIC_KEY || !process.env.PAYMENTS_SECRET_KEY) {
    return null;
  }
  return {
    id: "exenta",
    name: "Exenta Pay",
    kind: "exenta",
    source: "env",
    enabled: true,
    configured: true,
    sortOrder: 0,
    config: null,
  };
}

function rowToProvider(row: PaymentProviderRow): ResolvedProvider {
  let config: HttpProviderConfig | null = null;
  let configured = false;
  try {
    const parsed = parseStoredConfig(JSON.parse(row.config) as unknown);
    if ("config" in parsed) {
      config = parsed.config;
      configured = true;
    } else {
      console.error(`[payments] провайдер ${row.id}: ${parsed.error}`);
    }
  } catch (error) {
    console.error(`[payments] провайдер ${row.id}: конфиг не JSON`, error);
  }
  return {
    id: row.id,
    name: row.name,
    kind: "http",
    source: "db",
    enabled: row.enabled === 1,
    configured,
    sortOrder: row.sortOrder,
    config,
  };
}

/** Все провайдеры, включая выключенные и сломанные (для админки и сверки). */
export function listProviders(): ResolvedProvider[] {
  const exenta = exentaProvider();
  const rows = listPaymentProviderRows().map(rowToProvider);
  const all = exenta ? [exenta, ...rows] : rows;
  return all.sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  );
}

/** Доступные для новых счетов: включены и с валидным конфигом. */
export function listAvailableProviders(): ResolvedProvider[] {
  return listProviders().filter((provider) => provider.enabled && provider.configured);
}

export function getProvider(id: string): ResolvedProvider | null {
  if (id === "exenta") return exentaProvider();
  const row = getPaymentProviderRow(id);
  return row ? rowToProvider(row) : null;
}

/** Безопасное представление для клиентских компонентов админки. */
export function toProviderInfo(provider: ResolvedProvider): ProviderInfo {
  return {
    id: provider.id,
    name: provider.name,
    kind: provider.kind,
    source: provider.source,
    enabled: provider.enabled,
    configured: provider.configured,
    sortOrder: provider.sortOrder,
  };
}
