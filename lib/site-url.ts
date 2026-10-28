/**
 * Публичный адрес приложения. Для вебхуков внешних провайдеров нужен именно
 * он (HTTPS), а не origin входящего запроса: Cashera и аналоги отклоняют
 * `callback_url` на localhost.
 */

export function publicBaseUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function publicBaseIsHttps(): boolean {
  return publicBaseUrl().startsWith("https://");
}

/** Адрес вебхука HTTP-провайдера. */
export function providerWebhookUrl(providerId: string): string {
  return `${publicBaseUrl()}/api/payments/webhook/${providerId}`;
}

/** Старый адрес вебхука Exenta (менять в кабинете Exenta не нужно). */
export function exentaWebhookUrl(): string {
  return `${publicBaseUrl()}/api/payments/webhook`;
}
