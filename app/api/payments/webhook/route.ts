import { handleProviderWebhook } from "@/lib/payment-webhook";

export const runtime = "nodejs";

/**
 * Вебхук Exenta (`payment.success`). Старый адрес из кабинета Exenta: он
 * остаётся неизменным, а обработка общая для всех провайдеров.
 */
export async function POST(request: Request) {
  return handleProviderWebhook("exenta", request);
}
