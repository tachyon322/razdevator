"use client";

import { useEffect, useState } from "react";
import {
  MAX_TOPUP,
  MIN_TOPUP,
  PRICES,
  TOPUPS,
  formatPrice,
  isValidTopUp,
} from "@/lib/plans";
import { CloseIcon } from "./icons";
import { startPayment } from "./start-payment";

/** Список сумм пополнения: выбор суммы создаёт счёт и уводит на оплату. */
export function TopUpOptions({
  balance,
  onClose,
}: {
  balance: number;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const customValue = Number(custom);
  const customValid = custom !== "" && isValidTopUp(customValue);
  const busy = pending !== null;

  async function pay(amount: number) {
    if (busy) return;
    setPending(amount);
    setError(null);
    try {
      // При успехе остаёмся в состоянии загрузки до ухода со страницы.
      await startPayment({ amount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать счёт.");
      setPending(null);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="topup-title"
            className="font-display text-lg font-bold tracking-tight text-ink"
          >
            Пополнить баланс
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {balance > 0
              ? `Текущий баланс: ${formatPrice(balance)}`
              : "Выберите сумму пополнения"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-panel-hover hover:text-ink"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {TOPUPS.map((amount) => (
          <button
            key={amount}
            type="button"
            disabled={busy}
            onClick={() => void pay(amount)}
            className="flex flex-col items-center gap-0.5 rounded-tile border border-line bg-panel px-3 py-3 text-center transition-colors hover:border-line-strong hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="font-display text-lg font-bold tracking-tight text-ink">
              {pending === amount ? "Создаём счёт…" : formatPrice(amount)}
            </span>
            <span className="text-xs text-faint">
              ≈ {Math.floor(amount / PRICES.image)} фото
            </span>
          </button>
        ))}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <div className="relative flex-1">
          <input
            value={custom}
            onChange={(event) =>
              setCustom(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && customValid) {
                void pay(customValue);
              }
            }}
            disabled={busy}
            inputMode="numeric"
            autoComplete="off"
            aria-label="Своя сумма пополнения"
            placeholder="Своя сумма"
            className="h-11 w-full rounded-tile border border-line bg-panel px-3 pr-8 text-sm font-semibold text-ink transition-colors placeholder:font-normal placeholder:text-faint focus:border-line-strong focus:outline-none"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-faint">
            ₽
          </span>
        </div>
        <button
          type="button"
          disabled={!customValid || busy}
          onClick={() => void pay(customValue)}
          className="h-11 shrink-0 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {busy && pending === customValue ? "…" : "Пополнить"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-faint">
        От {formatPrice(MIN_TOPUP)} до {formatPrice(MAX_TOPUP)} · оплата через СБП
      </p>

      {error && (
        <p role="alert" className="mt-3 text-xs leading-5 text-brand">
          {error}
        </p>
      )}
    </div>
  );
}

/** Нижний лист с выбором суммы — для мобильного меню. */
export function TopUpSheet({
  balance,
  onClose,
}: {
  balance: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="topup-title"
    >
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-canvas/80 backdrop-blur-sm"
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-panel border-t border-line-strong bg-elevated p-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom,0px))] shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.9)]">
        <TopUpOptions balance={balance} onClose={onClose} />
      </div>
    </div>
  );
}
