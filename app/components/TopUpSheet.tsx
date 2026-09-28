"use client";

import { useEffect, useState } from "react";
import { PRICES, TOPUPS, formatPrice } from "@/lib/plans";
import { CloseIcon } from "./icons";

/** Список сумм пополнения и заглушка «оплата скоро». */
export function TopUpOptions({
  balance,
  onClose,
}: {
  balance: number;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null);

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

      {chosen === null ? (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {TOPUPS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => setChosen(amount)}
              className="flex flex-col items-center gap-0.5 rounded-tile border border-line bg-panel px-3 py-3 text-center transition-colors hover:border-line-strong hover:bg-panel-hover"
            >
              <span className="font-display text-lg font-bold tracking-tight text-ink">
                {formatPrice(amount)}
              </span>
              <span className="text-xs text-faint">
                ≈ {Math.floor(amount / PRICES.image)} фото
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-tile border border-brand/40 bg-brand-soft px-4 py-4 text-center">
          <p className="text-sm font-semibold text-ink">
            Оплата скоро подключится
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Мы уже подключаем оплату. Скоро можно будет пополнить баланс на{" "}
            {formatPrice(chosen)}.
          </p>
          <button
            type="button"
            onClick={() => setChosen(null)}
            className="mt-3 text-xs font-semibold text-ink underline underline-offset-2"
          >
            Выбрать другую сумму
          </button>
        </div>
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
