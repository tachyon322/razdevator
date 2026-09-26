"use client";

import { useState } from "react";
import { BoltIcon } from "./icons";

export interface QuickCredentials {
  email: string;
  login: string;
  password: string;
}

export function QuickAuthButton({
  label,
  onSuccess,
}: {
  label: string;
  onSuccess: (credentials: QuickCredentials) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/quick-auth", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | (QuickCredentials & { message?: string })
        | null;

      if (!res.ok || !data) {
        setError(data?.message ?? "Не удалось создать аккаунт, попробуйте ещё раз");
        setPending(false);
        return;
      }

      onSuccess({
        email: data.email,
        login: data.login,
        password: data.password,
      });
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex h-13 items-center justify-center gap-2 rounded-full border border-line-strong px-6 text-[15px] font-semibold text-ink transition-colors hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <BoltIcon className="size-5 text-brand" />
        {pending ? "Создаём аккаунт…" : label}
      </button>
      {error && (
        <p className="rounded-tile border border-brand/40 bg-brand-soft px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}
    </div>
  );
}
