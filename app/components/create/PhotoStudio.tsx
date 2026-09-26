"use client";

import { useEffect, useRef, useState } from "react";
import { Stepper } from "./Stepper";
import { UploadDropzone } from "./UploadDropzone";
import { StylePicker } from "./StylePicker";
import { ResultView } from "./ResultView";
import {
  DEMO_RESULTS,
  STYLE_CATEGORIES,
  demoResult,
  emptySelections,
  styleLabel,
  type Count,
  type Ratio,
  type Selections,
} from "./presets";
import { ArrowRightIcon, CameraIcon } from "../icons";

const MAX_SIZE = 10 * 1024 * 1024;
const MIN_SIDE = 512;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

async function imageSize(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return size;
}

export function PhotoStudio({
  planName,
  left,
  limit,
}: {
  planName: string;
  left: number;
  limit: number;
}) {
  const [step, setStep] = useState(1);
  const [maxReached, setMaxReached] = useState(1);

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  const [selections, setSelections] = useState<Selections>(emptySelections);
  const [ratio, setRatio] = useState<Ratio>("3:4");
  const [count, setCount] = useState<Count>(2);
  const [keepFace, setKeepFace] = useState(true);

  const [phase, setPhase] = useState<"generating" | "done">("generating");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);
  const [results, setResults] = useState<string[]>([]);
  const [favorite, setFavorite] = useState(false);

  const intervalRef = useRef<number | null>(null);

  const setPreview = (url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreviewUrl(url);
  };

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  const selectFile = async (file: File) => {
    setError(null);

    if (!TYPES.includes(file.type)) {
      setError("Поддерживаются только JPG, PNG или WebP.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("Файл больше 10 МБ. Загрузите фото поменьше.");
      return;
    }

    try {
      const { width, height } = await imageSize(file);
      if (width < MIN_SIDE || height < MIN_SIDE) {
        setError(`Минимальное разрешение — ${MIN_SIDE}×${MIN_SIDE}.`);
        return;
      }
    } catch {
      // не удалось прочитать размеры — пропускаем проверку
    }

    setFileName(file.name);
    setFileSize(file.size);
    setPreview(URL.createObjectURL(file));
    setMaxReached((prev) => Math.max(prev, 2));
  };

  const clearFile = () => {
    setPreview(null);
    setFileName(null);
    setFileSize(null);
    setError(null);
    setMaxReached(1);
    setStep(1);
  };

  const allSelected = STYLE_CATEGORIES.every((c) => selections[c.id]);

  const startGeneration = () => {
    if (!previewUrl || !allSelected) return;
    if (intervalRef.current) window.clearInterval(intervalRef.current);

    const seed = STYLE_CATEGORIES.map((c) => selections[c.id]).join("-");

    setStep(3);
    setMaxReached(3);
    setPhase("generating");
    setProgress(0);
    setStage(0);
    setResults([]);
    setFavorite(false);

    const variantCount = count;
    let p = 0;

    intervalRef.current = window.setInterval(() => {
      p = Math.min(100, p + 5 + Math.random() * 7);
      setProgress(Math.round(p));
      setStage(p < 33 ? 0 : p < 70 ? 1 : 2);

      if (p >= 100) {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
        intervalRef.current = null;

        const base = Math.max(0, DEMO_RESULTS.indexOf(demoResult(seed)));
        setResults(
          Array.from(
            { length: variantCount },
            (_, i) => DEMO_RESULTS[(base + i) % DEMO_RESULTS.length],
          ),
        );
        setPhase("done");
      }
    }, 240);
  };

  const goStep = (n: number) => {
    if (n > maxReached) return;
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStep(n);
  };

  const reset = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPreview(null);
    setFileName(null);
    setFileSize(null);
    setSelections(emptySelections());
    setResults([]);
    setFavorite(false);
    setProgress(0);
    setStage(0);
    setMaxReached(1);
    setStep(1);
  };

  const download = async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `razdevator-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // игнорируем
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <Stepper step={step} maxReached={maxReached} onStep={goStep} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="min-w-0">
          {step === 1 && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight text-ink">
                  Загрузите фото
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Одно чёткое фото анфас. Оно остаётся приватным.
                </p>
              </div>
              <UploadDropzone
                previewUrl={previewUrl}
                fileName={fileName}
                fileSize={fileSize}
                error={error}
                onSelect={selectFile}
                onClear={clearFile}
              />
              <button
                type="button"
                onClick={() => goStep(2)}
                disabled={!previewUrl}
                className="inline-flex h-13 items-center justify-center gap-2 self-end rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-7 text-[15px] font-semibold text-white shadow-[0_14px_40px_-16px_rgba(225,29,72,0.9)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                Далее
                <ArrowRightIcon className="size-5" />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight text-ink">
                  Выберите стиль
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Локация, образ, свет и ракурс — соберите свой кадр.
                </p>
              </div>
              <StylePicker
                selections={selections}
                onSelect={(categoryId, optionId) =>
                  setSelections((prev) => ({ ...prev, [categoryId]: optionId }))
                }
                ratio={ratio}
                onRatio={setRatio}
                count={count}
                onCount={setCount}
                keepFace={keepFace}
                onKeepFace={setKeepFace}
                left={left}
                limit={limit}
                onGenerate={startGeneration}
              />
              <button
                type="button"
                onClick={() => goStep(1)}
                className="self-start text-sm font-medium text-muted underline underline-offset-2 transition-colors hover:text-ink"
              >
                ← Назад к фото
              </button>
            </div>
          )}

          {step === 3 && previewUrl && (
            <ResultView
              status={phase}
              progress={progress}
              stage={stage}
              beforeUrl={previewUrl}
              results={results}
              favorite={favorite}
              onToggleFavorite={() => setFavorite((v) => !v)}
              onAgain={startGeneration}
              onReset={reset}
              onDownload={download}
            />
          )}

          {step === 3 && !previewUrl && (
            <div className="rounded-card border border-line bg-panel p-8 text-center">
              <p className="text-sm text-muted">
                Фото не найдено.{" "}
                <button
                  type="button"
                  onClick={reset}
                  className="font-medium text-ink underline underline-offset-2"
                >
                  Начать заново
                </button>
              </p>
            </div>
          )}
        </div>

        {/* Summary */}
        <aside className="h-fit lg:sticky lg:top-24">
          <div className="flex flex-col gap-4 rounded-card border border-line bg-panel p-5">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-tile border border-line bg-elevated">
              {previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="grid h-full place-items-center text-faint">
                  <CameraIcon className="size-7" />
                </span>
              )}
            </div>

            <dl className="flex flex-col gap-2.5 text-sm">
              {STYLE_CATEGORIES.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3"
                >
                  <dt className="text-muted">{c.label}</dt>
                  <dd className="font-medium text-ink">
                    {styleLabel(c.id, selections[c.id]) ?? "—"}
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Формат</dt>
                <dd className="font-medium text-ink">{ratio}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Количество</dt>
                <dd className="font-medium text-ink">{count}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Лицо</dt>
                <dd className="font-medium text-ink">
                  {keepFace ? "Сохраняем" : "Свободно"}
                </dd>
              </div>
            </dl>

            <div className="rounded-tile border border-line bg-elevated px-4 py-3">
              <p className="text-xs text-faint">Тариф</p>
              <p className="mt-0.5 text-sm font-semibold text-ink">{planName}</p>
              <p className="mt-0.5 text-xs text-muted">
                Осталось {left} из {limit} генераций
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
