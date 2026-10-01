"use client";

import { useFormStatus } from "react-dom";
import { updateSetting } from "../actions";

function Switch({ checked, label }: { checked: boolean; label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      role="switch"
      aria-checked={checked}
      aria-label={label}
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

/** Переключатель настройки: форма отправляет инвертированное значение. */
export function SettingToggle({
  settingKey,
  checked,
  label,
}: {
  settingKey: string;
  checked: boolean;
  label: string;
}) {
  return (
    <form action={updateSetting}>
      <input type="hidden" name="key" value={settingKey} />
      <input type="hidden" name="value" value={checked ? "0" : "1"} />
      <Switch checked={checked} label={label} />
    </form>
  );
}
