/**
 * Сведение статуса платежа с провайдером. Используется и вебхуком, и опросом
 * со страницы возврата: баланс пополняется только по статусу, полученному
 * напрямую из API провайдера, и ровно один раз (creditPayment).
 */

import {
  creditPayment,
  getPayment,
  paymentCreditRub,
  setPaymentProviderStatus,
  setPaymentStatus,
  type Payment,
} from "./db";
import { enqueueRevenue } from "./cashx";
import { rubToKopecks } from "./exenta";
import { getAdapter, type ProviderStatusResult } from "./payment-provider";
import { getProvider } from "./payment-provider-registry";

/** Итоговые статусы: дальше с провайдером сверять нечего. */
export function isFinalStatus(status: Payment["status"]): boolean {
  return status === "SUCCESS" || status === "FAILED" || status === "CANCELLED";
}

/** Применяет статус провайдера к нашему платежу. Возвращает свежую запись. */
export function applyProviderStatus(
  payment: Payment,
  provider: ProviderStatusResult,
): Payment {
  if (provider.providerUuid !== payment.providerUuid) {
    throw new Error(
      `Платёж ${payment.id}: uuid провайдера ${provider.providerUuid} не совпадает`,
    );
  }

  if (provider.currency && provider.currency.toUpperCase() !== "RUB") {
    console.error(
      `[payments] валюта не совпадает: платёж ${payment.id}, пришло ${provider.currency}`,
    );
    return payment;
  }

  if (provider.status === "SUCCESS") {
    // Сумму задаём мы при создании счёта; расхождение — повод разбираться вручную.
    if (
      provider.amount !== undefined &&
      provider.amount !== rubToKopecks(payment.amountRub)
    ) {
      console.error(
        `[payments] сумма не совпадает: платёж ${payment.id}, ждали ${rubToKopecks(payment.amountRub)}, пришло ${provider.amount}`,
      );
      return payment;
    }
    if (creditPayment(payment.id, (paid) => enqueueRevenue(paid))) {
      console.info(
        `[payments] зачислено ${paymentCreditRub(payment)} ₽ пользователю ${payment.userId} (платёж ${payment.id}${payment.packId ? `, пакет ${payment.packId}` : ""})`,
      );
    }
  } else if (provider.status !== payment.status) {
    setPaymentStatus(payment.id, provider.status);
  }

  if (provider.rawStatus) {
    setPaymentProviderStatus(payment.id, provider.rawStatus);
  }
  return getPayment(payment.id) ?? payment;
}

/** Запрашивает статус у провайдера, если платёж ещё не завершён. */
export async function reconcilePayment(payment: Payment): Promise<Payment> {
  if (!payment.providerUuid || isFinalStatus(payment.status)) return payment;
  const provider = getProvider(payment.providerId ?? "exenta");
  if (!provider || !provider.configured) {
    console.warn(
      `[payments] платёж ${payment.id}: провайдер ${payment.providerId ?? "exenta"} недоступен`,
    );
    return payment;
  }
  const providerStatus = await getAdapter(provider).fetchStatus(payment.providerUuid);
  return applyProviderStatus(payment, providerStatus);
}
