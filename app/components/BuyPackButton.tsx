"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { startPayment } from "./start-payment";

/** Кнопка покупки пакета на /pricing: создаёт счёт и уводит на оплату. */
export function BuyPackButton({
  packId,
  label,
  className,
}: {
  packId: string;
  label: string;
  className: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await startPayment({ packId });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        router.push("/login?next=/pricing");
        return;
      }
      setError(err instanceof Error ? err.message : "Не удалось создать счёт.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void buy()}
        disabled={busy}
        aria-busy={busy}
        className={`${className} disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0`}
      >
        {busy ? "Создаём счёт…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs leading-5 text-brand">
          {error}
        </p>
      )}
    </>
  );
}
