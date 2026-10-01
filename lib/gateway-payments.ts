/**
 * Сведение счёта шлюза с провайдером: используется и вебхуком Exenta, и
 * опросом статуса со страницы возврата. Успех проводится ровно один раз
 * (markGatewayPaid), после чего проекту ставится колбэк в очередь.
 */
import {
  enqueueGatewayCallback,
  getGatewayPayment,
  markGatewayPaid,
  setGatewayPaymentStatus,
  type GatewayPayment,
  type GatewayPaymentStatus,
} from "./db";
import { fetchPaymentStatus, rubToKopecks, type ProviderPayment } from "./exenta";

/** Статус, который уходит проекту: совпадает с его словарём (kazik). */
type CallbackStatus = "PAID" | "FAILED" | "CANCELED";

export function isGatewayFinal(status: GatewayPaymentStatus): boolean {
  return status === "PAID" || status === "FAILED" || status === "CANCELED";
}

/** Статусы Exenta → статусы шлюза. */
export function gatewayStatusFromProvider(
  status: ProviderPayment["status"],
): GatewayPaymentStatus {
  switch (status) {
    case "SUCCESS":
      return "PAID";
    case "CANCELLED":
      return "CANCELED";
    case "FAILED":
      return "FAILED";
    default:
      return "PENDING";
  }
}

/** Колбэк проекта; повторный статус не дублируется (eventId уникален). */
function queueCallback(payment: GatewayPayment, status: CallbackStatus): void {
  enqueueGatewayCallback(
    `gateway-${payment.projectId}-${payment.id}-${status}`,
    payment.projectId,
    payment.id,
    {
      payment_id: payment.id,
      client_order_id: payment.externalId,
      amount: String(payment.amountRub),
      currency: "rub",
      status,
      project: payment.projectId,
      purpose: payment.purpose ?? "deposit",
    },
  );
}

/** Применяет статус провайдера к счёту шлюза. Возвращает свежую запись. */
export function applyGatewayProviderStatus(
  payment: GatewayPayment,
  provider: ProviderPayment,
): GatewayPayment {
  if (provider.uuid !== payment.providerUuid) {
    throw new Error(
      `Счёт шлюза ${payment.id}: uuid провайдера ${provider.uuid} не совпадает`,
    );
  }

  const next = gatewayStatusFromProvider(provider.status);

  if (next === "PAID") {
    // Сумму задаём мы при создании счёта; расхождение — повод разбираться вручную.
    if (
      provider.amount !== undefined &&
      provider.amount !== rubToKopecks(payment.amountRub)
    ) {
      console.error(
        `[gateway] сумма не совпадает: счёт ${payment.id}, ждали ${rubToKopecks(payment.amountRub)}, пришло ${provider.amount}`,
      );
      return payment;
    }
    markGatewayPaid(payment.id);
    const fresh = getGatewayPayment(payment.id) ?? payment;
    if (fresh.status === "PAID") queueCallback(fresh, "PAID");
    return fresh;
  }

  // Успех не откатываем: PAID — окончательный статус счёта.
  if (payment.status === "PAID") return payment;

  if (next !== payment.status) {
    setGatewayPaymentStatus(payment.id, next);
  }
  const fresh = getGatewayPayment(payment.id) ?? payment;
  if (fresh.status === "FAILED" || fresh.status === "CANCELED") {
    queueCallback(fresh, fresh.status);
  }
  return fresh;
}

/** Запрашивает статус у провайдера, если счёт ещё не завершён. */
export async function reconcileGatewayPayment(
  payment: GatewayPayment,
): Promise<GatewayPayment> {
  if (!payment.providerUuid || isGatewayFinal(payment.status)) return payment;
  const provider = await fetchPaymentStatus(payment.providerUuid);
  return applyGatewayProviderStatus(payment, provider);
}
