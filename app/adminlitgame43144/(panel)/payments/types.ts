/**
 * Общие типы платёжного раздела админки. Модуль чистый: его можно
 * импортировать и из клиентских компонентов, и из серверных экшенов.
 */

/** Значения полей формы (строки — так их отдаёт input/textarea). */
export interface ProviderFormValues {
  name: string;
  sortOrder: string;
  baseUrl: string;
  currency: string;
  amountMultiplier: string;
  descriptionMaxLength: string;
  timeoutMs: string;
  retries: string;
  merchantId: string;
  createJson: string;
  responseJson: string;
  statusJson: string;
  webhookJson: string;
  statusMapJson: string;
}

/**
 * Состояние формы после Server Action. В `errors` — сообщения по полям
 * (`baseUrl`, `create`, `secrets.apiKey` и т.п. — ключи как у
 * validateHttpProviderConfig) и `_form` для общей ошибки.
 */
export interface ProviderFormState {
  errors: Record<string, string>;
}

/**
 * Маски секретов для инлайн-подсказок. Пустая строка — секрет не задан;
 * полное значение на клиент не уходит никогда.
 */
export interface SecretMasks {
  apiKey: string;
  apiSecret: string;
}
