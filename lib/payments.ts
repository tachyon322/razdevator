/**
 * Сведение статуса платежа с провайдером. Используется и вебхуком, и опросом
 * со страницы возврата: баланс пополняется только по статусу, полученному
 * напрямую из API Exenta, и ровно один раз (creditPayment).
 */

import {
  creditPayment,
  getPayment,
  setPaymentStatus,
  type Payment,
} from "./db";
import { fetchPaymentStatus, rubToKopecks, type ProviderPayment } from "./exenta";

/** Итоговые статусы: дальше с провайдером сверять нечего. */
export function isFinalStatus(status: Payment["status"]): boolean {
  return status === "SUCCESS" || status === "FAILED" || status === "CANCELLED";
}

/** Применяет статус провайдера к нашему платежу. Возвращает свежую запись. */
export function applyProviderStatus(
  payment: Payment,
  provider: ProviderPayment,
): Payment {
  if (provider.uuid !== payment.providerUuid) {
    throw new Error(
      `Платёж ${payment.id}: uuid провайдера ${provider.uuid} не совпадает`,
    );
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
    if (creditPayment(payment.id)) {
      console.info(
        `[payments] зачислено ${payment.amountRub} ₽ пользователю ${payment.userId} (платёж ${payment.id})`,
      );
    }
  } else if (provider.status !== payment.status) {
    setPaymentStatus(payment.id, provider.status);
  }

  return getPayment(payment.id) ?? payment;
}

/** Запрашивает статус у провайдера, если платёж ещё не завершён. */
export async function reconcilePayment(payment: Payment): Promise<Payment> {
  if (!payment.providerUuid || isFinalStatus(payment.status)) return payment;
  const provider = await fetchPaymentStatus(payment.providerUuid);
  return applyProviderStatus(payment, provider);
}
