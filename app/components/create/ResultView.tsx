"use client";

import { useRef, useState } from "react";
import {
  DownloadIcon,
  HeartIcon,
  RefreshIcon,
  SparkIcon,
  WandIcon,
} from "../icons";

export interface ResultAsset {
  id: string;
  kind: "image" | "video";
  url: string;
  durationSec?: number | null;
}

function BeforeAfter({ before, after }: { before: string; after: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);

  const update = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(98, Math.max(2, next)));
  };

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        update(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging) update(e.clientX);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      className="relative aspect-[3/4] w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-card border border-line bg-elevated"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={after}
        alt="После"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={before}
        alt="До"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />

      <span className="absolute left-3 top-3 rounded-full bg-canvas/70 px-3 py-1 text-xs font-semibold text-ink backdrop-blur">
        До
      </span>
      <span className="absolute right-3 top-3 rounded-full bg-canvas/70 px-3 py-1 text-xs font-semibold text-ink backdrop-blur">
        После
      </span>

      <div
        className="absolute inset-y-0 w-px bg-white/80"
        style={{ left: `${pos}%` }}
      >
        <span className="absolute left-1/2 top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/80 bg-canvas/80 text-white backdrop-blur">
          <span className="flex items-center gap-0.5">
            <span className="text-xs">‹</span>
            <span className="text-xs">›</span>
          </span>
        </span>
      </div>
    </div>
  );
}

export function ResultView({
  status,
  kind,
  progress,
  stageLabel,
  beforeUrl,
  assets,
  favorite,
  error,
  onToggleFavorite,
  onAgain,
  onReset,
  onDownload,
}: {
  status: "pending" | "processing" | "succeeded" | "failed";
  kind: "image" | "video";
  progress: number;
  stageLabel: string;
  beforeUrl: string;
  assets: ResultAsset[];
  favorite: boolean;
  error: string | null;
  onToggleFavorite: () => void;
  onAgain: () => void;
  onReset: () => void;
  onDownload: (url: string, filename: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (status === "pending" || status === "processing") {
    return (
      <div className="flex flex-col gap-5 rounded-card border border-line bg-panel p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 animate-pulse place-items-center rounded-full bg-brand-soft text-brand">
            <WandIcon className="size-5" />
          </span>
          <div>
            <p className="font-semibold text-ink">{stageLabel}</p>
            <p className="text-sm text-muted">
              {kind === "video"
                ? "Видео обычно рендерится 2–4 минуты. Страницу можно не закрывать."
                : "Обычно занимает около 30 секунд"}
            </p>
          </div>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-panel-hover">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#e11d48,#9f1239)] transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="-mt-2 text-right text-xs text-faint">{progress}%</p>

        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-tile border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={beforeUrl}
            alt=""
            className="h-full w-full scale-105 object-cover blur-md"
          />
          <span className="absolute inset-0 grid place-items-center">
            <SparkIcon className="size-8 animate-pulse text-white/80" />
          </span>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col gap-5 rounded-card border border-brand/40 bg-panel p-6">
        <h2 className="font-display text-xl font-bold tracking-tight text-ink">
          Не получилось
        </h2>
        <p className="text-sm text-muted">
          {error ?? "Не удалось сгенерировать результат. Попробуйте ещё раз."}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onAgain}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            <RefreshIcon className="size-4" />
            Попробовать снова
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-line-strong text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
          >
            Начать заново
          </button>
        </div>
      </div>
    );
  }

  const isVideo = kind === "video";
  const main = assets[Math.min(activeIndex, assets.length - 1)];

  if (!main) {
    return (
      <div className="rounded-card border border-line bg-panel p-8 text-center text-sm text-muted">
        Результат пуст.{" "}
        <button
          type="button"
          onClick={onReset}
          className="font-medium text-ink underline underline-offset-2"
        >
          Начать заново
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {isVideo ? (
        <video
          key={main.url}
          src={main.url}
          poster={beforeUrl}
          controls
          playsInline
          className="aspect-[3/4] w-full rounded-card border border-line bg-black object-contain"
        />
      ) : (
        <BeforeAfter before={beforeUrl} after={main.url} />
      )}

      {!isVideo && assets.length > 1 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {assets.map((asset, i) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              title={`Вариант ${i + 1}`}
              className={[
                "group relative aspect-square overflow-hidden rounded-tile border transition-colors",
                i === activeIndex ? "border-brand" : "border-line",
              ].join(" ")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset.url}
                alt={`Вариант ${i + 1}`}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() =>
            onDownload(
              main.url,
              `razdevator-${Date.now()}.${isVideo ? "mp4" : "jpg"}`,
            )
          }
          className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-6 text-[15px] font-semibold text-white shadow-[0_14px_40px_-16px_rgba(225,29,72,0.9)] transition-transform hover:-translate-y-0.5"
        >
          <DownloadIcon className="size-5" />
          {isVideo ? "Скачать видео" : "Скачать"}
        </button>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onAgain}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-line-strong text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
          >
            <RefreshIcon className="size-4" />
            Ещё вариант
          </button>
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={favorite}
            className={[
              "inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border text-sm font-semibold transition-colors",
              favorite
                ? "border-brand bg-brand-soft text-brand"
                : "border-line-strong text-ink hover:bg-panel-hover",
            ].join(" ")}
          >
            <HeartIcon
              className="size-4"
              fill={favorite ? "currentColor" : "none"}
            />
            {favorite ? "В избранном" : "В избранное"}
          </button>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="text-sm font-medium text-muted underline underline-offset-2 transition-colors hover:text-ink"
        >
          Создать ещё
        </button>
      </div>
    </div>
  );
}
