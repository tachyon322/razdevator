import { NextResponse } from "next/server";
import { getPaymentByProviderUuid } from "@/lib/db";
import {
  fetchPaymentStatus,
  unwrapData,
  verifyWebhookSignature,
} from "@/lib/exenta";
import { applyProviderStatus } from "@/lib/payments";

export const runtime = "nodejs";

/**
 * Вебхук Exenta (`payment.success`). Подпись проверяем по сырому телу, но
 * телу всё равно не доверяем: статус и сумму перечитываем из API провайдера.
 * Повторная доставка безопасна — зачисление идемпотентно.
 */
export async function POST(request: Request) {
  const secret = process.env.PAYMENTS_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[payments] PAYMENTS_WEBHOOK_SECRET не задан — вебхук отклонён");
    return NextResponse.json({ message: "Webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    console.warn("[payments] вебхук с неверной подписью");
    return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
  }

  let uuid: unknown;
  try {
    const data = unwrapData(JSON.parse(rawBody));
    uuid = data?.paymentUuid ?? data?.uuid;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  if (typeof uuid !== "string" || !uuid) {
    return NextResponse.json({ message: "paymentUuid required" }, { status: 400 });
  }

  const payment = getPaymentByProviderUuid(uuid);
  if (!payment) {
    // Не наш счёт — подтверждаем, чтобы провайдер не повторял доставку.
    console.warn(`[payments] вебхук для неизвестного платежа ${uuid}`);
    return NextResponse.json({ ok: true });
  }
  if (payment.creditedAt) return NextResponse.json({ ok: true });

  try {
    const provider = await fetchPaymentStatus(uuid);
    applyProviderStatus(payment, provider);
  } catch (error) {
    // 5xx — пусть провайдер повторит; страница возврата тоже досверит.
    console.error(`[payments] вебхук ${uuid}: сверка не удалась:`, error);
    return NextResponse.json({ message: "Temporary error" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
