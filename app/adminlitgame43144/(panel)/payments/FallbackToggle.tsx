"use client";

import { useFormStatus } from "react-dom";
import { updateFallback } from "./actions";

function Switch({ checked }: { checked: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      role="switch"
      aria-checked={checked}
      aria-label="Резервная цепочка провайдеров"
      disabled={pending}
      className="relative h-7 w-12 shrink-0 rounded-full border border-line-strong bg-elevated transition-colors aria-checked:border-brand aria-checked:bg-brand disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={[
          "absolute top-1/2 size-5 -translate-y-1/2 rounded-full bg-ink transition-[left]",
          checked ? "left-[calc(100%-1.375rem)]" : "left-0.5",
        ].join(" ")}
      />
    </button>
  );
}

/** Тумблер фолбэка: форма отправляет инвертированное значение. */
export function FallbackToggle({ enabled }: { enabled: boolean }) {
  return (
    <form action={updateFallback}>
      <input type="hidden" name="value" value={enabled ? "0" : "1"} />
      <Switch checked={enabled} />
    </form>
  );
}
