"use client";

import Link from "next/link";
import { useState } from "react";
import { useBalance } from "./balance-store";
import { TopUpSheet } from "./TopUpSheet";

/**
 * Кнопка карточки цены на /pricing: ведёт в студию, а если залогиненному
 * пользователю не хватает баланса на одну генерацию — открывает пополнение.
 * Гостям всегда «Создать»: студия сама отправит на вход.
 */
export function CreateOrTopUpButton({
  price,
  label,
  className,
}: {
  price: number;
  label: string;
  className: string;
}) {
  const { status, balance } = useBalance();
  const [open, setOpen] = useState(false);

  if (status !== "authed" || balance >= price) {
    return (
      <Link href="/create" className={className}>
        {label}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={className}
      >
        Пополнить баланс
      </button>
      {open && (
        <TopUpSheet balance={balance} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
