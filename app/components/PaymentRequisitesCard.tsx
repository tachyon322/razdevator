"use client";

import { useState } from "react";
import type { PaymentRequisites } from "@/lib/payment-requisites";

/**
 * Реквизиты H2H-счёта: QR-картинка, ссылка на оплату или номер для перевода.
 * Покупатель платит, не уходя на страницу провайдера.
 */
export function PaymentRequisitesCard({
  requisites,
}: {
  requisites: PaymentRequisites;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(requisites.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // буфер недоступен — покупатель скопирует вручную
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-3 text-left">
      {requisites.payAmount ? (
        <p className="text-center text-sm text-muted">
          Переведите ровно{" "}
          <span className="font-semibold text-ink">{requisites.payAmount} ₽</span>
        </p>
      ) : null}

      {requisites.kind === "image" ? (
        // data URL уже проверен на сервере (png/jpeg/webp в base64)
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={requisites.value}
          alt="QR-код для оплаты"
          className="size-56 rounded-xl bg-white object-contain p-2"
        />
      ) : null}

      {requisites.kind === "link" ? (
        <a
          href={requisites.value}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-6 text-sm font-semibold text-white"
        >
          Оплатить в приложении банка
        </a>
      ) : null}

      {requisites.kind === "text" ? (
        <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-panel-hover px-4 py-3">
          <span className="break-all font-mono text-base text-ink">
            {requisites.value}
          </span>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 text-sm font-semibold text-muted hover:text-ink"
          >
            {copied ? "Скопировано" : "Копировать"}
          </button>
        </div>
      ) : null}

      {requisites.bank || requisites.owner || requisites.comment ? (
        <dl className="w-full space-y-1 text-sm">
          {requisites.bank ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Банк</dt>
              <dd className="text-right text-ink">{requisites.bank}</dd>
            </div>
          ) : null}
          {requisites.owner ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Получатель</dt>
              <dd className="text-right text-ink">{requisites.owner}</dd>
            </div>
          ) : null}
          {requisites.comment ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Комментарий</dt>
              <dd className="text-right text-ink">{requisites.comment}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
