import { handleProviderWebhook } from "@/lib/payment-webhook";

export const runtime = "nodejs";

/**
 * Вебхук HTTP-провайдера: адрес `/api/payments/webhook/<providerId>`.
 * Провайдер аутентифицируется секретами из своего конфига, а счёт ищется
 * по паре `(providerId, uuid)`, поэтому переключение провайдера не ломает
 * уже выставленные счета.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ providerId: string }> },
) {
  const { providerId } = await params;
  return handleProviderWebhook(providerId, request);
}
