"use client";

import { useEffect, useRef, useState } from "react";
import { Stepper } from "./Stepper";
import { UploadDropzone } from "./UploadDropzone";
import { StylePicker } from "./StylePicker";
import { ResultView, type ResultAsset } from "./ResultView";
import {
  IMAGE_STAGES,
  STYLE_CATEGORIES,
  VIDEO_STAGES,
  emptySelections,
  hasSelection,
  isCategoryIgnored,
  styleLabel,
  type Count,
  type Ratio,
  type Selections,
  type StudioMode,
  type VideoResolution,
} from "./presets";
import type { GenerationDTO } from "@/lib/generation-dto";
import { prepareImageUpload } from "@/lib/image-client";
import { PRICES, formatPrice, type Billing } from "@/lib/plans";
import { ArrowRightIcon, CameraIcon, SparkIcon } from "../icons";

const POLL_START_MS = 2500;
const POLL_SLOW_MS = 5000;
const POLL_IDLE_MS = 8000;
const POLL_MAX_BACKOFF_MS = 10_000;

function stageLabelFor(mode: StudioMode, progress: number): string {
  const stages = mode === "video" ? VIDEO_STAGES : IMAGE_STAGES;
  if (mode === "video") {
    if (progress < 15) return stages[0];
    if (progress < 30) return stages[1];
    if (progress < 85) return stages[2];
    return stages[3];
  }
  if (progress < 33) return stages[0];
  if (progress < 70) return stages[1];
  return stages[2];
}

export function PhotoStudio({
  planName,
  left: initialLeft,
  limit,
  balance: initialBalance,
}: {
  planName: string;
  left: number;
  limit: number;
  balance: number;
}) {
  const [mode, setMode] = useState<StudioMode>("image");
  const [step, setStep] = useState(1);
  const [maxReached, setMaxReached] = useState(1);

  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const previewRef = useRef<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);
  const prepareTokenRef = useRef(0);

  const [selections, setSelections] = useState<Selections>(emptySelections);
  const [ratio, setRatio] = useState<Ratio>("3:4");
  const [count, setCount] = useState<Count>(2);
  const [keepFace, setKeepFace] = useState(true);

  const [videoResolution, setVideoResolution] =
    useState<VideoResolution>("720p");
  const [duration, setDuration] = useState(5);
  const [audio, setAudio] = useState(false);

  const [left, setLeft] = useState(initialLeft);
  const [balance, setBalance] = useState(initialBalance);
  const pendingBillingRef = useRef<Billing | null>(null);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [job, setJob] = useState<GenerationDTO | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [favorite, setFavorite] = useState(false);

  const setPreview = (url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreviewUrl(url);
  };

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  // При смене шага прокручиваем студию к началу. Иначе на мобильном после
  // нажатия «Сгенерировать» внизу длинной формы результат рендерится сверху
  // и остаётся за пределами экрана — кажется, что ничего не произошло.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const jobId = job?.id ?? null;
  const jobStatus = job?.status ?? null;

  // Тикер прогресса, пока задача в работе.
  useEffect(() => {
    if (!jobId || jobStatus === "succeeded" || jobStatus === "failed") return;
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [jobId, jobStatus]);

  // Поллинг статуса генерации: самопланирующийся таймер вместо setInterval,
  // чтобы запросы не наслаивались. На скрытой вкладке опрос приостанавливается,
  // а при возврате выполняется сразу. Интервал растёт по мере ожидания, при
  // ошибке — небольшой backoff.
  useEffect(() => {
    if (!jobId || jobStatus === "succeeded" || jobStatus === "failed") return;
    let cancelled = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let delay = POLL_START_MS;
    const startedAt = Date.now();

    const clear = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const run = async () => {
      if (cancelled || document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      let next = delay;
      try {
        const res = await fetch(`/api/generations/${jobId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as GenerationDTO;
        if (cancelled) return;
        setJob(data);
        setFavorite(data.favorite);
        if (data.status === "succeeded") {
          const billing = pendingBillingRef.current;
          if (billing) {
            if (billing.mode === "trial") {
              setLeft((value) => Math.max(0, value - billing.units));
            } else {
              setBalance((value) => Math.max(0, value - billing.costRub));
            }
            pendingBillingRef.current = null;
          }
          return;
        }
        if (data.status === "failed") return;
        const age = Date.now() - startedAt;
        next =
          age > 120_000
            ? POLL_IDLE_MS
            : age > 30_000
              ? POLL_SLOW_MS
              : POLL_START_MS;
      } catch (error) {
        if (cancelled || (error as Error).name === "AbortError") return;
        next = Math.min(Math.round(delay * 1.5), POLL_MAX_BACKOFF_MS);
      }
      delay = next;
      if (!cancelled && !document.hidden) {
        clear();
        timer = window.setTimeout(run, delay);
      }
    };

    const onVisibility = () => {
      if (cancelled || document.hidden) return;
      clear();
      delay = POLL_START_MS;
      void run();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void run();

    return () => {
      cancelled = true;
      controller?.abort();
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [jobId, jobStatus]);

  const selectFile = async (next: File) => {
    setError(null);
    setPreparing(true);
    const token = ++prepareTokenRef.current;
    try {
      const prepared = await prepareImageUpload(next);
      // Пока готовили фото, пользователь мог выбрать другое — игнорируем устаревший результат.
      if (token !== prepareTokenRef.current) return;
      setFile(prepared.file);
      setFileName(prepared.file.name);
      setFileSize(prepared.compressedSize);
      setPreview(URL.createObjectURL(prepared.file));
      setMaxReached((prev) => Math.max(prev, 2));
    } catch (err) {
      if (token !== prepareTokenRef.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось подготовить фото. Попробуйте другой файл.",
      );
    } finally {
      if (token === prepareTokenRef.current) setPreparing(false);
    }
  };

  const clearFile = () => {
    prepareTokenRef.current += 1;
    setPreparing(false);
    setPreview(null);
    setFile(null);
    setFileName(null);
    setFileSize(null);
    setError(null);
    setMaxReached(1);
    setStep(1);
  };

  const allSelected = STYLE_CATEGORIES.every(
    (c) =>
      c.optional ||
      isCategoryIgnored(c.id, selections) ||
      hasSelection(selections[c.id]),
  );

  const selectOption = (categoryId: string, optionId: string) => {
    setSelections((prev) => {
      const category = STYLE_CATEGORIES.find((c) => c.id === categoryId);
      if (category?.multiple) {
        const current = Array.isArray(prev[categoryId])
          ? (prev[categoryId] as string[])
          : [];
        const next = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
        return { ...prev, [categoryId]: next };
      }
      return { ...prev, [categoryId]: optionId };
    });
  };

  const switchMode = (next: StudioMode) => {
    if (next === mode) return;
    pendingBillingRef.current = null;
    setMode(next);
    setJob(null);
    setFavorite(false);
    setElapsed(0);
    setStartError(null);
    setStep(file ? 2 : 1);
    setMaxReached(file ? 2 : 1);
  };

  const startGeneration = async () => {
    if (!file || !allSelected || busy) return;
    setBusy(true);
    setStartError(null);

    const form = new FormData();
    form.set("file", file);
    form.set("kind", mode);
    form.set("selections", JSON.stringify(selections));
    form.set("ratio", ratio);
    if (mode === "image") {
      form.set("count", String(count));
      form.set("keepFace", String(keepFace));
      form.set("resolution", "1k");
    } else {
      form.set("resolution", videoResolution);
      form.set("duration", String(duration));
      form.set("audio", String(audio));
    }

    try {
      const res = await fetch("/api/generate", { method: "POST", body: form });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        setStartError(data?.message ?? "Не удалось запустить генерацию.");
        return;
      }
      const data = (await res.json()) as { id: string; billing?: Billing };
      pendingBillingRef.current = data.billing ?? null;
      setJob({
        id: data.id,
        kind: mode,
        status: "pending",
        prompt: "",
        params: {},
        sourceUrl: null,
        error: null,
        favorite: false,
        costUsd: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        assets: [],
      });
      setFavorite(false);
      setElapsed(0);
      setStep(3);
      setMaxReached(3);
    } catch {
      setStartError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  const goStep = (n: number) => {
    if (n > maxReached) return;
    setStep(n);
  };

  const reset = () => {
    prepareTokenRef.current += 1;
    pendingBillingRef.current = null;
    setPreparing(false);
    setPreview(null);
    setFile(null);
    setFileName(null);
    setFileSize(null);
    setSelections(emptySelections());
    setJob(null);
    setFavorite(false);
    setElapsed(0);
    setStartError(null);
    setMaxReached(1);
    setStep(1);
  };

  const toggleFavorite = async () => {
    if (!job) return;
    const next = !favorite;
    setFavorite(next);
    try {
      await fetch(`/api/generations/${job.id}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
    } catch {
      setFavorite(!next);
    }
  };

  const download = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // игнорируем
    }
  };

  const active = job && (job.status === "pending" || job.status === "processing");
  const progress = active
    ? mode === "video"
      ? Math.min(93, Math.round(elapsed * 0.7))
      : Math.min(93, Math.round(elapsed * 4))
    : job?.status === "succeeded"
      ? 100
      : 0;

  const resultAssets: ResultAsset[] = (job?.assets ?? []).map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    url: asset.url,
    durationSec: asset.durationSec,
  }));

  return (
    <div ref={topRef} className="flex scroll-mt-24 flex-col gap-8">
      {/* Режим */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-full border border-line bg-panel p-1">
          {(
            [
              { id: "image", label: "Фото" },
              { id: "video", label: "Видео" },
            ] as { id: StudioMode; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => switchMode(item.id)}
              aria-pressed={mode === item.id}
              className={[
                "inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors",
                mode === item.id
                  ? "bg-[linear-gradient(135deg,#e11d48,#9f1239)] text-white"
                  : "text-muted hover:text-ink",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">
          {mode === "image"
            ? "Оживите одно фото: новый образ, локация и свет."
            : "Превратите фото в короткое видео с движением камеры."}
        </p>
      </div>

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
                  {mode === "video"
                    ? "Одно чёткое фото — именно оно станет основой видео."
                    : "Одно чёткое фото анфас. Оно остаётся приватным."}
                </p>
              </div>
              <UploadDropzone
                previewUrl={previewUrl}
                fileName={fileName}
                fileSize={fileSize}
                error={error}
                preparing={preparing}
                onSelect={selectFile}
                onClear={clearFile}
              />
              <button
                type="button"
                onClick={() => goStep(2)}
                disabled={!previewUrl || preparing}
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
                  {mode === "video" ? "Настройте видео" : "Выберите стиль"}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {mode === "video"
                    ? "Локация, образ, свет и ракурс — плюс параметры видео."
                    : "Локация, образ, свет и ракурс — соберите свой кадр."}
                </p>
              </div>
              <StylePicker
                mode={mode}
                selections={selections}
                onSelect={selectOption}
                ratio={ratio}
                onRatio={setRatio}
                count={count}
                onCount={setCount}
                keepFace={keepFace}
                onKeepFace={setKeepFace}
                videoResolution={videoResolution}
                onVideoResolution={setVideoResolution}
                duration={duration}
                onDuration={setDuration}
                audio={audio}
                onAudio={setAudio}
                left={left}
                limit={limit}
                balance={balance}
                busy={busy}
                onGenerate={startGeneration}
              />

              {startError && (
                <p className="rounded-tile border border-brand/40 bg-brand-soft px-4 py-3 text-sm text-ink">
                  {startError}
                </p>
              )}

              <button
                type="button"
                onClick={() => goStep(1)}
                className="self-start text-sm font-medium text-muted underline underline-offset-2 transition-colors hover:text-ink"
              >
                ← Назад к фото
              </button>
            </div>
          )}

          {step === 3 && previewUrl && job && (
            <>
              {startError && (
                <p className="mb-4 rounded-tile border border-brand/40 bg-brand-soft px-4 py-3 text-sm text-ink">
                  {startError}
                </p>
              )}
              <ResultView
                status={job.status}
                kind={job.kind}
                progress={progress}
                stageLabel={stageLabelFor(mode, progress)}
                beforeUrl={previewUrl}
                assets={resultAssets}
                favorite={favorite}
                error={job.error}
                busy={busy}
                onToggleFavorite={toggleFavorite}
                onAgain={startGeneration}
                onReset={reset}
                onDownload={download}
              />
            </>
          )}

          {step === 3 && (!previewUrl || !job) && (
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

        {/* Summary. На мобильном в шаге выбора стиля поднимаем блок над
            заголовком «Выберите стиль»; в шаге загрузки прячем — он дублирует
            фото и параметры ещё пустые. На десктопе order/скрытие сбрасываются. */}
        <aside
          className={[
            "h-fit lg:sticky lg:top-24 lg:order-none",
            step === 2 ? "order-first" : "",
            step === 1 ? "hidden lg:block" : "",
          ].join(" ")}
        >
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
              <span className="absolute left-3 top-3 rounded-full border border-line-strong bg-canvas/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink backdrop-blur">
                {mode === "video" ? "Видео" : "Фото"}
              </span>
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
              {mode === "image" ? (
                <>
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
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Разрешение</dt>
                    <dd className="font-medium text-ink">
                      {videoResolution}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Длительность</dt>
                    <dd className="font-medium text-ink">{duration} с</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Звук</dt>
                    <dd className="font-medium text-ink">
                      {audio ? "Есть" : "Нет"}
                    </dd>
                  </div>
                </>
              )}
            </dl>

            <div className="rounded-tile border border-line bg-elevated px-4 py-3">
              <p className="text-xs text-faint">Доступ</p>
              <p className="mt-0.5 text-sm font-semibold text-ink">{planName}</p>
              <p className="mt-0.5 text-xs text-muted">
                Осталось {left} из {limit} генераций
              </p>
              <p className="mt-1 text-xs text-faint">
                Баланс: {formatPrice(balance)}
              </p>
              <p className="mt-1 text-xs text-faint">
                Фото {formatPrice(PRICES.image)} · Видео {formatPrice(PRICES.video)}
              </p>
            </div>

            <p className="flex items-start gap-2 text-xs text-faint">
              <SparkIcon className="mt-0.5 size-3.5 shrink-0 text-brand" />
              Результат сохраняется в вашей галерее.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
