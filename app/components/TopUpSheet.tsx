"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  PACKS,
  PACK_MODE_TOPUP_RANGE,
  PRICES,
  TOPUPS,
  TOPUP_RANGE,
  formatPrice,
  isValidTopUp,
  packCreditRub,
  type TopUpRange,
} from "@/lib/plans";
import { useBalance } from "./balance-store";
import { BuyPackButton } from "./BuyPackButton";
import { CloseIcon } from "./icons";
import { startPayment } from "./start-payment";

function SheetHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2
          id="topup-title"
          className="font-display text-lg font-bold tracking-tight text-ink"
        >
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
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
  );
}

/** Создание счёта на сумму: какая сумма сейчас в работе и ошибка, если не вышло. */
function useTopUpPayment() {
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay(amount: number) {
    if (pending !== null) return;
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

  return { pending, error, pay };
}

/** Поле «Своя сумма» с кнопкой и подсказкой о пределах. */
function CustomAmountField({
  range,
  pending,
  onPay,
}: {
  range: TopUpRange;
  pending: number | null;
  onPay: (amount: number) => void;
}) {
  const [custom, setCustom] = useState("");
  const customValue = Number(custom);
  const customValid = custom !== "" && isValidTopUp(customValue, range);
  const busy = pending !== null;

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            value={custom}
            onChange={(event) =>
              setCustom(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && customValid) onPay(customValue);
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
          onClick={() => onPay(customValue)}
          className="h-11 shrink-0 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {busy && pending === customValue ? "…" : "Пополнить"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-faint">
        От {formatPrice(range.min)} до {formatPrice(range.max)} · оплата через СБП
      </p>
    </>
  );
}

function PaymentError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-3 text-xs leading-5 text-brand">
      {error}
    </p>
  );
}

/**
 * Режим «только пакеты» (настройка админки): карточки пакетов как на странице
 * цен и своя сумма в узком диапазоне PACK_MODE_TOPUP_RANGE.
 */
function PackOptions({
  balance,
  onClose,
}: {
  balance: number;
  onClose: () => void;
}) {
  const { pending, error, pay } = useTopUpPayment();

  return (
    <div>
      <SheetHeader
        title="Пополнить баланс"
        subtitle={
          balance > 0
            ? `Текущий баланс: ${formatPrice(balance)}`
            : "Выберите пакет или свою сумму"
        }
        onClose={onClose}
      />

      <div className="mt-4 flex flex-col gap-2.5">
        {PACKS.map((pack) => (
          <div
            key={pack.id}
            className={[
              "rounded-tile border bg-panel p-4",
              pack.highlighted ? "border-brand/50" : "border-line",
            ].join(" ")}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-ink">{pack.name}</span>
              <span className="font-display text-lg font-bold tracking-tight text-ink">
                {formatPrice(pack.price)}
              </span>
            </div>
            <p className="mt-1 text-xs text-faint">
              {pack.images} фото · {pack.videos} видео · на баланс{" "}
              {formatPrice(packCreditRub(pack))}
            </p>
            <BuyPackButton
              packId={pack.id}
              label={pack.cta}
              className={[
                "mt-3 inline-flex h-10 w-full items-center justify-center rounded-full text-sm font-semibold transition-transform hover:-translate-y-0.5",
                pack.highlighted
                  ? "bg-[linear-gradient(135deg,#e11d48,#9f1239)] text-white"
                  : "border border-line-strong text-ink hover:bg-panel-hover",
              ].join(" ")}
            />
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs font-medium text-muted">Или своя сумма</p>
      <div className="mt-2">
        <CustomAmountField
          range={PACK_MODE_TOPUP_RANGE}
          pending={pending}
          onPay={(amount) => void pay(amount)}
        />
      </div>
      <PaymentError error={error} />
    </div>
  );
}

/**
 * Содержимое модалки пополнения: суммы на выбор или — если так настроено в
 * админке — только пакеты.
 */
export function TopUpOptions({
  balance,
  onClose,
}: {
  balance: number;
  onClose: () => void;
}) {
  const { customTopUp } = useBalance();
  if (!customTopUp) return <PackOptions balance={balance} onClose={onClose} />;
  return <AmountOptions balance={balance} onClose={onClose} />;
}

/** Список сумм пополнения: выбор суммы создаёт счёт и уводит на оплату. */
function AmountOptions({
  balance,
  onClose,
}: {
  balance: number;
  onClose: () => void;
}) {
  const { pending, error, pay } = useTopUpPayment();
  const busy = pending !== null;

  return (
    <div>
      <SheetHeader
        title="Пополнить баланс"
        subtitle={
          balance > 0
            ? `Текущий баланс: ${formatPrice(balance)}`
            : "Выберите сумму пополнения"
        }
        onClose={onClose}
      />

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

      <div className="mt-2.5">
        <CustomAmountField
          range={TOPUP_RANGE}
          pending={pending}
          onPay={(amount) => void pay(amount)}
        />
      </div>
      <PaymentError error={error} />
    </div>
  );
}

/**
 * Модальное окно с выбором суммы. На любом разрешении это карточка по центру
 * экрана. Рендерится через портал в `document.body`: внутри шапки есть
 * `backdrop-blur`, который создаёт containing block для `position: fixed`, и без
 * портала оверлей запирался бы в границах навбара.
 */
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

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
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
      <div className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-card border border-line-strong bg-elevated p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
        <TopUpOptions balance={balance} onClose={onClose} />
      </div>
    </div>,
    document.body,
  );
}
