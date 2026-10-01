"use client";

import { useEffect, useSyncExternalStore } from "react";

export interface BalanceState {
  /** `loading` — ещё не знаем; `guest` — не авторизован; `authed` — есть сессия. */
  status: "loading" | "guest" | "authed";
  balance: number;
  /** Пополнение на произвольную сумму доступно; иначе в модалке только пакеты (настройка админки). */
  customTopUp: boolean;
}

const INITIAL: BalanceState = { status: "loading", balance: 0, customTopUp: true };

let state: BalanceState = INITIAL;
const listeners = new Set<() => void>();
let started = false;
let inflight: Promise<void> | null = null;

function setState(next: BalanceState) {
  state = next;
  for (const listener of listeners) listener();
}

/** Перечитывает баланс из /api/me. Параллельные вызовы схлопываются в один. */
export function refreshBalance(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (res.status === 401) {
        setState({ status: "guest", balance: 0, customTopUp: state.customTopUp });
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as {
        balanceRub?: number;
        customTopUp?: boolean;
      };
      setState({
        status: "authed",
        balance: data.balanceRub ?? 0,
        customTopUp: data.customTopUp ?? true,
      });
    } catch {
      // сеть/сервер недоступны — оставляем прежнее состояние
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (!started) {
    started = true;
    void refreshBalance();
  }
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): BalanceState {
  return state;
}

// На сервере и при гидратации всегда «loading» — расходиться с разметкой нечему.
function getServerSnapshot(): BalanceState {
  return INITIAL;
}

/** Подписка на баланс + обновление при возврате фокуса/видимости вкладки. */
export function useBalance(): BalanceState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const onFocus = () => void refreshBalance();
    const onVisibility = () => {
      if (!document.hidden) void refreshBalance();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return snapshot;
}
