"use client";

import { CheckIcon } from "../icons";

const LABELS = ["Фото", "Стиль", "Результат"];

export function Stepper({
  step,
  maxReached,
  onStep,
}: {
  step: number;
  maxReached: number;
  onStep: (step: number) => void;
}) {
  return (
    <ol className="flex w-full items-center gap-2 sm:gap-3">
      {LABELS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        const clickable = n <= maxReached;

        return (
          <li
            key={label}
            className={
              i < LABELS.length - 1
                ? "flex flex-1 items-center gap-2 sm:gap-3"
                : "flex items-center gap-2 sm:gap-3"
            }
          >
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStep(n)}
              aria-current={active ? "step" : undefined}
              className={[
                "flex items-center gap-2 rounded-full",
                clickable ? "cursor-pointer" : "cursor-default",
              ].join(" ")}
            >
              <span
                className={[
                  "grid size-9 shrink-0 place-items-center rounded-full border text-sm font-semibold transition-colors",
                  done
                    ? "border-brand bg-brand text-white"
                    : active
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-line-strong text-faint",
                ].join(" ")}
              >
                {done ? <CheckIcon className="size-4" /> : n}
              </span>
              <span
                className={[
                  "text-sm font-medium",
                  active || done ? "text-ink" : "text-faint",
                ].join(" ")}
              >
                {label}
              </span>
            </button>
            {i < LABELS.length - 1 && (
              <span
                className={[
                  "h-px flex-1",
                  done ? "bg-brand/60" : "bg-line",
                ].join(" ")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
