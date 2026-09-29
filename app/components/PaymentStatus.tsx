"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { PaymentStatus as Status } from "@/lib/db";
import { formatPrice } from "@/lib/plans";
import { refreshBalance } from "./balance-store";
import { ArrowRightIcon, CheckIcon, CloseIcon, SpinnerIcon } from "./icons";

const POLL_MS = 3000;
/** Счёт живёт 15 минут — дольше ждать нечего. */
const POLL_LIMIT_MS = 20 * 60 * 1000;

function isFinal(status: Status): boolean {
  return status === "SUCCESS" || status === "FAILED" || status === "CANCELLED";
}

/** Статус пополнения на странице возврата: опрашивает сервер до итога. */
export function PaymentStatus({
  id,
  amountRub,
  creditRub,
  packName,
  initialStatus,
}: {
  id: string;
  /** Сколько платит покупатель. */
  amountRub: number;
  /** Сколько зачисляется на баланс (у пакета — больше оплаченного). */
  creditRub: number;
  /** Название пакета; null — обычное пополнение. */
  packName: string | null;
  initialStatus: Status;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isFinal(status)) {
      if (status === "SUCCESS") void refreshBalance();
      return;
    }
    const startedAt = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/payments/${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { status: Status };
          if (cancelled) return;
          if (data.status !== status) {
            setStatus(data.status);
            return; // эффект перезапустится с новым статусом
          }
        }
      } catch {
        // сеть моргнула — попробуем на следующем шаге
      }
      if (cancelled) return;
      if (Date.now() - startedAt > POLL_LIMIT_MS) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, status]);

  const amount = formatPrice(amountRub);
  const credit = formatPrice(creditRub);

  if (status === "SUCCESS") {
    return (
      <Card
        icon={<CheckIcon className="size-6" />}
        tone="success"
        title={packName ? `${packName} оплачен` : "Баланс пополнен"}
        text={`На баланс зачислено ${credit}. Можно генерировать.`}
      >
        <PrimaryLink href="/create">К генерации</PrimaryLink>
      </Card>
    );
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return (
      <Card
        icon={<CloseIcon className="size-6" />}
        tone="error"
        title={status === "CANCELLED" ? "Счёт отменён" : "Оплата не прошла"}
        text={
          packName
            ? `Деньги не списаны. Купить «${packName}» можно ещё раз на странице цен.`
            : `Деньги не списаны. Пополнить баланс на ${amount} можно ещё раз — кнопкой с кошельком в шапке.`
        }
      >
        <PrimaryLink href={packName ? "/pricing" : "/create"}>
          {packName ? "К ценам" : "Вернуться в студию"}
        </PrimaryLink>
      </Card>
    );
  }

  return (
    <Card
      icon={<SpinnerIcon className="size-6 animate-spin" />}
      tone="pending"
      title="Ждём подтверждения оплаты"
      text={
        timedOut
          ? "Банк ещё не подтвердил платёж. Если деньги списались, баланс пополнится автоматически — обновите страницу позже или напишите в поддержку."
          : `${packName ? `${packName}, счёт` : "Счёт"} на ${amount}. Обычно подтверждение приходит за несколько секунд — страница обновится сама.`
      }
    >
      <Link
        href="/support"
        className="text-sm font-semibold text-muted underline underline-offset-2 hover:text-ink"
      >
        Нужна помощь?
      </Link>
    </Card>
  );
}

function Card({
  icon,
  tone,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  tone: "success" | "error" | "pending";
  title: string;
  text: string;
  children: ReactNode;
}) {
  const iconTone =
    tone === "success"
      ? "bg-emerald-500/15 text-emerald-400"
      : tone === "error"
        ? "bg-brand-soft text-brand"
        : "bg-panel-hover text-muted";

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center rounded-panel border border-line bg-panel p-8 text-center"
    >
      <span className={`grid size-14 place-items-center rounded-full ${iconTone}`}>
        {icon}
      </span>
      <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight text-ink">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
    >
      {children}
      <ArrowRightIcon className="size-4" />
    </Link>
  );
}
