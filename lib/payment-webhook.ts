/**
 * Общий обработчик вебхуков провайдеров. Один и тот же код обслуживает
 * внутренние пополнения и счета внешнего шлюза: счёт ищется по паре
 * `(providerId, providerUuid)`, поэтому переключение провайдера не мешает
 * старым счетам.
 */

import {
  getGatewayPaymentByProviderUuid,
  getPaymentByProviderUuid,
  hasPaymentEvent,
  recordPaymentEvent,
} from "./db";
import { applyGatewayProviderStatus } from "./gateway-payments";
import { applyProviderStatus } from "./payments";
import {
  getAdapter,
  type ProviderDeps,
  type ProviderStatusResult,
} from "./payment-provider";
import { getProvider } from "./payment-provider-registry";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * POST-обработчик вебхука конкретного провайдера. Возвращает 200 после
 * приёма и обработки, 401 при неверной подписи, 400 при битом теле,
 * 502 — если не удалось перечитать статус (пусть провайдер повторит).
 */
export async function handleProviderWebhook(
  providerId: string,
  request: Request,
  deps: ProviderDeps = {},
): Promise<Response> {
  const provider = getProvider(providerId);
  if (!provider) {
    return json({ message: "Провайдер не найден" }, 404);
  }
  if (!provider.configured) {
    console.error(`[payments] вебхук ${providerId}: конфиг провайдера не загружен`);
    return json({ message: "Провайдер не настроен" }, 503);
  }

  const rawBody = await request.text();
  const adapter = getAdapter(provider, deps);

  if (!adapter.verifyWebhook(request.headers, rawBody)) {
    console.warn(`[payments] вебхук ${providerId}: неверная подпись`);
    return json({ message: "Invalid signature" }, 401);
  }

  // webhook.test, выплаты, подписки и будущие события: подтверждаем доставку,
  // но не пытаемся разобрать как платёж.
  if (adapter.isIgnorableWebhook(rawBody)) {
    console.info(
      `[payments] вебхук ${providerId}: служебное или чужое событие — пропускаем`,
    );
    return json({ ok: true });
  }

  let parsed;
  try {
    parsed = adapter.parseWebhook(rawBody);
  } catch (error) {
    console.warn(`[payments] вебхук ${providerId}: ${messageOf(error)}`);
    return json({ message: "Invalid payload" }, 400);
  }

  if (hasPaymentEvent(providerId, parsed.eventId)) {
    return json({ ok: true });
  }

  const payment = getPaymentByProviderUuid(providerId, parsed.providerUuid);
  const gatewayPayment = payment
    ? null
    : getGatewayPaymentByProviderUuid(providerId, parsed.providerUuid);

  if (parsed.status === "IGNORE") {
    recordPaymentEvent({
      providerId,
      eventId: parsed.eventId,
      paymentId: payment?.id,
      gatewayPaymentId: gatewayPayment?.id,
      rawStatus: parsed.rawStatus,
      mappedStatus: "IGNORE",
      amount: parsed.amount,
      currency: parsed.currency,
      payload: parsed.payload,
    });
    console.warn(
      `[payments] ${providerId}: событие ${parsed.rawStatus} по ${parsed.providerUuid} — возврат/спор, баланс не меняем`,
    );
    return json({ ok: true });
  }

  if (!payment && !gatewayPayment) {
    console.warn(
      `[payments] вебхук ${providerId}: неизвестный счёт ${parsed.providerUuid}`,
    );
    return json({ ok: true });
  }

  const amountRub = payment?.amountRub ?? gatewayPayment!.amountRub;
  // Адаптер провайдера нормализует любые суммы в копейки, поэтому сверяем
  // ожидаемую сумму тоже в копейках.
  const expectedAmount = String(Math.round(amountRub * 100));
  const expectedCurrency = (provider.config?.currency ?? "RUB").toUpperCase();

  if (
    (parsed.amount !== undefined && parsed.amount !== expectedAmount) ||
    (parsed.currency !== undefined && parsed.currency !== expectedCurrency)
  ) {
    console.error(
      `[payments] ${providerId}: счёт ${parsed.providerUuid} — не совпали сумма/валюта: ждали ${expectedAmount} ${expectedCurrency}, пришло ${parsed.amount ?? "?"} ${parsed.currency ?? "?"}`,
    );
    recordPaymentEvent({
      providerId,
      eventId: parsed.eventId,
      paymentId: payment?.id,
      gatewayPaymentId: gatewayPayment?.id,
      rawStatus: parsed.rawStatus,
      mappedStatus: "MISMATCH",
      amount: parsed.amount,
      currency: parsed.currency,
      payload: parsed.payload,
    });
    return json({ ok: true });
  }

  let providerStatus: ProviderStatusResult;
  if (adapter.trustBody) {
    providerStatus = {
      providerUuid: parsed.providerUuid,
      status: parsed.status,
      rawStatus: parsed.rawStatus,
      amount: parsed.amount,
      currency: parsed.currency ?? expectedCurrency,
    };
  } else {
    try {
      providerStatus = await adapter.fetchStatus(parsed.providerUuid);
    } catch (error) {
      console.error(
        `[payments] ${providerId}: не удалось перечитать статус ${parsed.providerUuid}: ${messageOf(error)}`,
      );
      return json({ message: "Temporary error" }, 502);
    }
  }

  try {
    if (payment) {
      applyProviderStatus(payment, providerStatus);
    } else {
      applyGatewayProviderStatus(gatewayPayment!, providerStatus);
    }
  } catch (error) {
    console.error(
      `[payments] ${providerId}: не удалось применить статус ${parsed.providerUuid}: ${messageOf(error)}`,
    );
    return json({ message: "Temporary error" }, 502);
  }

  recordPaymentEvent({
    providerId,
    eventId: parsed.eventId,
    paymentId: payment?.id,
    gatewayPaymentId: gatewayPayment?.id,
    rawStatus: providerStatus.rawStatus,
    mappedStatus: providerStatus.status,
    amount: providerStatus.amount,
    currency: providerStatus.currency,
    payload: parsed.payload,
  });

  return json({ ok: true });
}
