"use client";

export class PaymentRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PaymentRequestError";
    this.status = status;
  }
}

/**
 * Создаёт счёт (`{ amount }` — пополнение, `{ packId }` — пакет) и уводит
 * покупателя на страницу оплаты. Промис резолвится только при ошибке —
 * при успехе страница уже уходит.
 */
export async function startPayment(
  body: { amount: number } | { packId: string },
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PaymentRequestError("Нет связи с сервером. Попробуйте ещё раз.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as {
    redirectUrl?: string;
    message?: string;
  };
  if (!res.ok || !data.redirectUrl) {
    throw new PaymentRequestError(
      data.message ?? "Не удалось создать счёт. Попробуйте позже.",
      res.status,
    );
  }
  window.location.assign(data.redirectUrl);
}
