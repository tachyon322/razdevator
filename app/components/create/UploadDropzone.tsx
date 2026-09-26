"use client";

import { useRef, useState } from "react";
import { RefreshIcon, TrashIcon, UploadIcon } from "../icons";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function UploadDropzone({
  previewUrl,
  fileName,
  fileSize,
  error,
  preparing,
  onSelect,
  onClear,
}: {
  previewUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  error: string | null;
  preparing: boolean;
  onSelect: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = () => {
    if (!preparing) inputRef.current?.click();
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onSelect(file);
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {previewUrl ? (
        <div className="overflow-hidden rounded-panel border border-line bg-panel">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Загруженное фото"
              className="max-h-[420px] w-full bg-elevated object-contain"
            />
            <button
              type="button"
              onClick={onClear}
              aria-label="Удалить фото"
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-full border border-line-strong bg-canvas/70 text-ink backdrop-blur transition-colors hover:bg-brand hover:text-white"
            >
              <TrashIcon className="size-5" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{fileName}</p>
              {fileSize !== null && (
                <p className="text-xs text-faint">{formatSize(fileSize)}</p>
              )}
            </div>
            <button
              type="button"
              onClick={pick}
              disabled={preparing}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
            >
              {preparing ? (
                <RefreshIcon className="size-4 animate-spin" />
              ) : (
                <UploadIcon className="size-4" />
              )}
              {preparing ? "Готовим…" : "Заменить"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={preparing}
          aria-busy={preparing}
          onDragOver={(e) => {
            if (preparing) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!preparing) handleFiles(e.dataTransfer.files);
          }}
          className={[
            "flex w-full flex-col items-center gap-4 rounded-panel border-2 border-dashed px-6 py-14 text-center transition-colors",
            dragging && !preparing
              ? "border-brand bg-brand-soft"
              : "border-line-strong bg-panel hover:border-brand/50 hover:bg-panel-hover",
            preparing ? "cursor-wait" : "",
          ].join(" ")}
        >
          <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand">
            {preparing ? (
              <RefreshIcon className="size-6 animate-spin" />
            ) : (
              <UploadIcon className="size-6" />
            )}
          </span>
          <span>
            <span className="block text-base font-semibold text-ink">
              {preparing
                ? "Готовим фото…"
                : "Перетащите фото или выберите файл"}
            </span>
            <span className="mt-1 block text-sm text-muted">
              {preparing
                ? "Сжимаем и оптимизируем изображение"
                : "JPG, PNG или WebP · до 5 МБ · от 512×512"}
            </span>
          </span>
        </button>
      )}

      {error && (
        <p className="rounded-tile border border-brand/40 bg-brand-soft px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}
    </div>
  );
}
