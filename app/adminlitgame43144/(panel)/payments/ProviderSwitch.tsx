"use client";

import { useFormStatus } from "react-dom";
import { setActiveProvider } from "./actions";

export interface ProviderOption {
  id: string;
  name: string;
  available: boolean;
}

function SwitchSelect({
  value,
  options,
  emptyLabel,
}: {
  value: string;
  options: ProviderOption[];
  emptyLabel: string;
}) {
  const { pending } = useFormStatus();

  // Текущий выбор может ссылаться на провайдера, которого уже нет в реестре:
  // показываем его отдельным пунктом, чтобы select не «прыгал» на пустое.
  const allOptions = options.some((option) => option.id === value)
    ? options
    : value
      ? [...options, { id: value, name: `${value} — нет в списке`, available: false }]
      : options;

  return (
    <select
      name="providerId"
      // key заставляет select пересоздаться, когда сервер вернул новое
      // значение: без этого неконтролируемый select сохранял бы старый выбор.
      key={value}
      defaultValue={value}
      disabled={pending}
      aria-label="Активный провайдер"
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className="h-10 w-full max-w-[15rem] rounded-tile border border-line bg-elevated px-3 text-sm text-ink focus:border-line-strong focus:outline-none disabled:opacity-60"
    >
      <option value="">{emptyLabel}</option>
      {allOptions.map((option) => (
        <option
          key={option.id}
          value={option.id}
          disabled={!option.available && option.id !== value}
        >
          {option.name}
          {option.available ? "" : " (недоступен)"}
        </option>
      ))}
    </select>
  );
}

/**
 * Выбор активного провайдера для scope (`site` или `project:<id>`).
 * Отправляется сразу при смене значения; без JS остаётся кнопка «Применить».
 */
export function ProviderSwitch({
  scopeKey,
  value,
  options,
  emptyLabel,
}: {
  scopeKey: string;
  value: string;
  options: ProviderOption[];
  emptyLabel: string;
}) {
  return (
    <form action={setActiveProvider} className="flex items-center gap-2">
      <input type="hidden" name="scope" value={scopeKey} />
      <SwitchSelect value={value} options={options} emptyLabel={emptyLabel} />
      <noscript>
        <button
          type="submit"
          className="h-10 rounded-full border border-line-strong px-3 text-xs font-semibold text-ink"
        >
          Применить
        </button>
      </noscript>
    </form>
  );
}
