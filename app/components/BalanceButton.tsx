"use client";

import { useEffect, useRef, useState } from "react";
import { Wallet } from "lucide-react";
import { formatPrice } from "@/lib/plans";
import { useBalance } from "./balance-store";
import { TopUpOptions, TopUpSheet } from "./TopUpSheet";

/** Баланс в шапке (десктоп): клик открывает выбор суммы пополнения. */
export function BalanceButton() {
  const { status, balance } = useBalance();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Гостям и тем, чей статус ещё грузится, баланс не показываем: вход рисует AuthButtons.
  if (status !== "authed") return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Баланс ${formatPrice(balance)}. Пополнить`}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-3.5 text-sm font-semibold text-ink transition-colors hover:border-line-strong hover:bg-panel-hover"
      >
        <Wallet className="size-4 text-brand" strokeWidth={1.8} aria-hidden="true" />
        <span>{formatPrice(balance)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-labelledby="topup-title"
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 rounded-card border border-line-strong bg-elevated/95 p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl"
        >
          <TopUpOptions balance={balance} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/**
 * Баланс в шапке (мобильный): стоит слева от бургер-меню, клик открывает
 * нижний лист с суммами — тот же, что у плашки «Пополнить» внизу экрана.
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
