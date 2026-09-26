"use client";

import {
  COUNTS,
  RATIOS,
  STYLE_CATEGORIES,
  type Count,
  type Ratio,
  type Selections,
} from "./presets";
import { BoltIcon, CheckIcon } from "../icons";

export function StylePicker({
  selections,
  onSelect,
  ratio,
  onRatio,
  count,
  onCount,
  keepFace,
  onKeepFace,
  left,
  limit,
  onGenerate,
}: {
  selections: Selections;
  onSelect: (categoryId: string, optionId: string) => void;
  ratio: Ratio;
  onRatio: (r: Ratio) => void;
  count: Count;
  onCount: (c: Count) => void;
  keepFace: boolean;
  onKeepFace: (v: boolean) => void;
  left: number;
  limit: number;
  onGenerate: () => void;
}) {
  const selectedCount = STYLE_CATEGORIES.filter(
    (c) => selections[c.id],
  ).length;
  const allSelected = selectedCount === STYLE_CATEGORIES.length;
  const outOfLimit = left <= 0;
  const missing = STYLE_CATEGORIES.filter((c) => !selections[c.id]).map(
    (c) => c.label.toLowerCase(),
  );

  return (
    <div className="flex flex-col gap-7">
      {/* Параметры — каждый независимый */}
      {STYLE_CATEGORIES.map((category) => {
        const chosen = selections[category.id];
        return (
          <section key={category.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">
                {category.label}
              </h3>
              <span className="text-xs text-faint">
                {chosen ? "выбрано" : "не выбрано"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {category.options.map((option) => {
                const selected = option.id === chosen;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelect(category.id, option.id)}
                    aria-pressed={selected}
                    className={[
                      "flex items-center justify-between gap-2 rounded-tile border px-4 py-3.5 text-left text-sm font-semibold transition-colors",
                      selected
                        ? "border-brand bg-brand-soft text-ink"
                        : "border-line bg-panel text-muted hover:bg-panel-hover hover:text-ink",
                    ].join(" ")}
                  >
                    {option.label}
                    {selected && (
                      <CheckIcon className="size-4 shrink-0 text-brand" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Настройки */}
      <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-panel">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-muted">Формат</span>
          <div className="flex gap-2">
            {RATIOS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onRatio(r.id)}
                className={[
                  "h-10 min-w-14 rounded-full px-3 text-sm font-semibold transition-colors",
                  r.id === ratio
                    ? "bg-brand text-white"
                    : "border border-line-strong text-muted hover:bg-panel-hover hover:text-ink",
                ].join(" ")}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-muted">Количество</span>
          <div className="flex gap-2">
            {COUNTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onCount(c)}
                className={[
                  "grid h-10 min-w-10 place-items-center rounded-full px-3 text-sm font-semibold transition-colors",
                  c === count
                    ? "bg-brand text-white"
                    : "border border-line-strong text-muted hover:bg-panel-hover hover:text-ink",
                ].join(" ")}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-5">
          <div>
            <span className="text-sm font-medium text-ink">Сохранить лицо</span>
            <p className="mt-0.5 text-xs text-faint">
              Максимально сохранить черты с исходного фото
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={keepFace}
            onClick={() => onKeepFace(!keepFace)}
            className={[
              "relative h-7 w-12 shrink-0 rounded-full transition-colors",
              keepFace ? "bg-brand" : "bg-panel-hover",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-1 size-5 rounded-full bg-white transition-all",
                keepFace ? "left-6" : "left-1",
              ].join(" ")}
            />
          </button>
        </div>
      </div>

      {/* Лимит + генерация */}
      <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">Выбрано параметров</span>
          <span className="text-sm font-semibold text-ink">
            {selectedCount} из {STYLE_CATEGORIES.length}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">Лимит генераций</span>
          <span className="text-sm font-semibold text-ink">
            Осталось {left} из {limit}
          </span>
        </div>

        {outOfLimit && (
          <p className="rounded-tile border border-brand/40 bg-brand-soft px-4 py-3 text-sm text-ink">
            Лимит исчерпан. Выберите тариф, чтобы продолжить.
          </p>
        )}

        <button
          type="button"
          onClick={onGenerate}
          disabled={!allSelected || outOfLimit}
          className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-6 text-[15px] font-semibold text-white shadow-[0_14px_40px_-16px_rgba(225,29,72,0.9)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <BoltIcon className="size-5" />
          Сгенерировать
        </button>

        {!allSelected && !outOfLimit && (
          <p className="text-center text-xs text-faint">
            Выберите: {missing.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
