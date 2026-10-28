"use client";

import { useEffect, useRef, useState } from "react";

type CopyState = "idle" | "copied" | "error";

const LABELS: Record<CopyState, string> = {
  idle: "Копировать",
  copied: "Скопировано",
  error: "Не удалось",
};

/** Копирование вебхук-URL в буфер обмена (клиентская часть списка). */
export function CopyButton({
  text,
  label = "Копировать",
}: {
  text: string;
  label?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("error");
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-7 shrink-0 items-center rounded-full border border-line-strong px-2.5 text-[11px] font-semibold text-muted transition-colors hover:text-ink"
    >
      {state === "idle" ? label : LABELS[state]}
    </button>
  );
}
