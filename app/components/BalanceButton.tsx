"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { formatPrice } from "@/lib/plans";
import { useBalance } from "./balance-store";
import { TopUpSheet } from "./TopUpSheet";

/** Баланс в шапке (десктоп): клик открывает модалку выбора суммы пополнения. */
export function BalanceButton() {
  const { status, balance } = useBalance();
  const [open, setOpen] = useState(false);

  // Гостям и тем, чей статус ещё грузится, баланс не показываем: вход рисует AuthButtons.
  if (status !== "authed") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Баланс ${formatPrice(balance)}. Пополнить`}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-3.5 text-sm font-semibold text-ink transition-colors hover:border-line-strong hover:bg-panel-hover"
      >
        <Wallet className="size-4 text-brand" strokeWidth={1.8} aria-hidden="true" />
        <span>{formatPrice(balance)}</span>
      </button>

      {open && <TopUpSheet balance={balance} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Баланс в шапке (мобильный): стоит слева от бургер-меню, клик открывает
 * модалку с суммами пополнения — ту же, что и на десктопе.
 */
export function MobileBalance() {
  const { status, balance } = useBalance();
  const [open, setOpen] = useState(false);

  // Гостям и тем, чей статус ещё грузится, баланс не показываем: вход — в бургер-меню.
  if (status !== "authed") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Баланс ${formatPrice(balance)}. Пополнить`}
        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold text-ink transition-colors hover:border-line-strong hover:bg-panel-hover lg:hidden"
      >
        <Wallet className="size-4 text-brand" strokeWidth={1.8} aria-hidden="true" />
        <span>{formatPrice(balance)}</span>
      </button>

      {open && <TopUpSheet balance={balance} onClose={() => setOpen(false)} />}
    </>
  );
}
