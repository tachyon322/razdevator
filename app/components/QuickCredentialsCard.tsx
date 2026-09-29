"use client";

import { useState } from "react";
import type { QuickCredentials } from "./QuickAuthButton";
import { ArrowRightIcon, CheckIcon } from "./icons";

/**
 * Экран с данными созданного в 1 клик аккаунта: логин, пароль и копирование.
 * Переиспользуется на страницах входа/регистрации и в модалке QuickAuthModal.
 */
export function QuickCredentialsCard({
  credentials,
  onProceed,
  as: Heading = "h2",
}: {
  credentials: QuickCredentials;
  onProceed: () => void;
  as?: "h1" | "h2";
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `Логин: ${credentials.email}\nПароль: ${credentials.password}`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="w-full max-w-md rounded-panel border border-line bg-panel p-7 shadow-[0_40px_120px_-50px_rgba(0,0,0,0.9)] sm:p-9">
      <span className="grid size-11 place-items-center rounded-tile bg-brand-soft text-brand">
        <CheckIcon className="size-5" />
      </span>

      <Heading className="mt-5 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        Аккаунт создан
      </Heading>
      <p className="mt-2 text-sm text-muted">
        Сохраните данные — email и пароль понадобятся для входа.
      </p>

      <div className="mt-6 rounded-tile border border-line-strong bg-panel-hover p-5">
        <span className="text-xs uppercase tracking-wider text-faint">
          Логин
        </span>
        <p className="mt-1 break-all font-mono text-base font-semibold text-ink">
          {credentials.email}
        </p>

        <div className="my-4 h-px bg-line" />

        <span className="text-xs uppercase tracking-wider text-faint">
          Пароль
        </span>
        <p className="mt-1 break-all font-mono text-base font-semibold text-ink">
          {credentials.password}
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line-strong text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
        >
          {copied ? (
            <>
              <CheckIcon className="size-4 text-brand" />
              Скопировано
            </>
          ) : (
            "Скопировать"
          )}
        </button>
        <button
          type="button"
          onClick={onProceed}
          className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-6 text-[15px] font-semibold text-white shadow-[0_14px_40px_-16px_rgba(225,29,72,0.9)] transition-transform hover:-translate-y-0.5"
        >
          Продолжить
          <ArrowRightIcon className="size-5" />
        </button>
      </div>
    </div>
  );
}
