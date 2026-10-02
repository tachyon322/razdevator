"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgeAssessment } from "@/lib/moderation";

interface Params {
  minAge: number;
  minConfidence: number;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

interface Result {
  id: string;
  name: string;
  image: string;
  status: "running" | "done" | "error";
  assessment?: AgeAssessment;
  prodAllowed?: boolean | null;
  elapsedMs?: number;
  raw?: string;
  error?: string;
}

const EMPTY_PARAMS: Params = {
  minAge: 18,
  minConfidence: 0.6,
  model: "",
  systemPrompt: "",
  userPrompt: "",
};

/** Те же условия, что в isSourceAllowed прода, но с порогами из формы. */
function reasonsFor(assessment: AgeAssessment, params: Params): string[] {
  const reasons: string[] = [];
  if (assessment.faces < 1) reasons.push("не распознано ни одного лица");
  if (assessment.minor) reasons.push("модель отметила несовершеннолетнего");
  if (assessment.confidence < params.minConfidence) {
    reasons.push(
      `уверенность ${assessment.confidence.toFixed(2)} ниже порога ${params.minConfidence}`,
    );
  }
  if (assessment.youngestAge === null) reasons.push("возраст не определён");
  else if (assessment.youngestAge < params.minAge) {
    reasons.push(`возраст ${assessment.youngestAge} меньше порога ${params.minAge}`);
  }
  return reasons;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function shrinkToDataUrl(file: File, max = 1024): Promise<string> {
  const original = await readAsDataUrl(file);
  const image = document.createElement("img");
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = original;
  });
  const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
  if (scale === 1) return original;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) return original;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function Verdict({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ${
        ok ? "bg-success/15 text-success" : "bg-brand-soft text-brand"
      }`}
    >
      {ok ? "проходит" : "отказ"}
    </span>
  );
}

export function ModerationTester() {
  const [params, setParams] = useState<Params>(EMPTY_PARAMS);
  const [results, setResults] = useState<Result[]>([]);
  const [shrink, setShrink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Стенд локальный: закрываем окно 18+ тем же способом, что и кнопка «Да, мне 18».
  useEffect(() => {
    try {
      window.localStorage.setItem("razdevator.ageVerified", "1");
      window.dispatchEvent(new Event("razdevator:agegate"));
    } catch {
      // приватный режим — не страшно
    }
  }, []);

  useEffect(() => {
    fetch("/api/dev/moderation")
      .then((res) => res.json())
      .then((data: Partial<Params>) =>
        setParams((prev) => ({
          minAge: data.minAge ?? prev.minAge,
          minConfidence: data.minConfidence ?? prev.minConfidence,
          model: data.model ?? prev.model,
          systemPrompt: data.systemPrompt ?? prev.systemPrompt,
          userPrompt: data.userPrompt ?? prev.userPrompt,
        })),
      )
      .catch(() => undefined);
  }, []);

  async function run(items: Result[], current: Params) {
    setBusy(true);
    for (const item of items) {
      setResults((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, status: "running", error: undefined, assessment: undefined }
            : row,
        ),
      );
      try {
        const res = await fetch("/api/dev/moderation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: item.image,
            model: current.model,
            systemPrompt: current.systemPrompt,
            userPrompt: current.userPrompt,
          }),
        });
        const data = (await res.json()) as {
          assessment?: AgeAssessment;
          prodAllowed?: boolean | null;
          elapsedMs?: number;
          raw?: string;
          error?: string;
          parseError?: string;
        };
        setResults((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  status: data.assessment ? "done" : "error",
                  assessment: data.assessment,
                  prodAllowed: data.prodAllowed ?? null,
                  elapsedMs: data.elapsedMs,
                  raw: data.raw,
                  error: data.error ?? data.parseError ?? undefined,
                }
              : row,
          ),
        );
      } catch (error) {
        setResults((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  status: "error",
                  error: error instanceof Error ? error.message : "запрос не прошёл",
                }
              : row,
          ),
        );
      }
    }
    setBusy(false);
  }

  async function addFiles(files: FileList | File[] | null) {
    const list = files ? [...files] : [];
    if (list.length === 0) return;
    const items: Result[] = [];
    for (const file of list) {
      try {
        items.push({
          id: crypto.randomUUID(),
          name: file.name,
          image: shrink ? await shrinkToDataUrl(file) : await readAsDataUrl(file),
          status: "running",
        });
      } catch {
        items.push({
          id: crypto.randomUUID(),
          name: file.name,
          image: "",
          status: "error",
          error: "файл не прочитался",
        });
      }
    }
    setResults((prev) => [...items, ...prev]);
    await run(
      items.filter((item) => item.image),
      params,
    );
  }

  const stats = useMemo(() => {
    const done = results.filter((row) => row.status === "done" && row.assessment);
    const passed = done.filter(
      (row) => reasonsFor(row.assessment!, params).length === 0,
    ).length;
    return { total: done.length, passed, failed: done.length - passed };
  }, [results, params]);

  const defaults = params.model === "" && params.systemPrompt === "";

  return (
    <main className="container-page flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Стенд возрастных ворот
          </h1>
          <p className="mt-1 text-sm text-muted">
            Локальная страница: в проде её нет. Фото никуда не сохраняются, уходят
            только в модель проверки.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>
            проверено {stats.total} · проходит {stats.passed} · отказ {stats.failed}
          </span>
          <button
            type="button"
            disabled={busy || results.length === 0}
            onClick={() => run(results, params)}
            className="h-9 rounded-full border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover disabled:opacity-50"
          >
            Прогнать заново
          </button>
          <button
            type="button"
            disabled={busy || results.length === 0}
            onClick={() => setResults([])}
            className="h-9 rounded-full px-3 text-sm font-medium text-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            Очистить
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <section className="flex flex-col gap-4 rounded-card border border-line bg-panel p-5">
          <h2 className="font-display text-sm font-semibold tracking-tight text-ink">
            Параметры проверки
          </h2>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Минимальный визуальный возраст: {params.minAge}
            <input
              type="range"
              min={14}
              max={30}
              step={1}
              value={params.minAge}
              onChange={(event) =>
                setParams((prev) => ({ ...prev, minAge: Number(event.target.value) }))
              }
              className="accent-brand"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Минимальная уверенность: {params.minConfidence.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={params.minConfidence}
              onChange={(event) =>
                setParams((prev) => ({
                  ...prev,
                  minConfidence: Number(event.target.value),
                }))
              }
              className="accent-brand"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Модель
            <input
              type="text"
              value={params.model}
              onChange={(event) =>
                setParams((prev) => ({ ...prev, model: event.target.value }))
              }
              className="h-9 rounded-tile border border-line bg-elevated px-3 text-sm text-ink focus:border-line-strong focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={shrink}
              onChange={(event) => setShrink(event.target.checked)}
              className="accent-brand"
            />
            Сжимать до 1024 px перед отправкой (быстрее, но отличается от прода)
          </label>

          <details className="text-xs text-muted">
            <summary className="cursor-pointer select-none font-medium text-muted hover:text-ink">
              Промпты {defaults ? "(по умолчанию — как в проде)" : "(изменены)"}
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                Системный промпт
                <textarea
                  rows={7}
                  value={params.systemPrompt}
                  onChange={(event) =>
                    setParams((prev) => ({ ...prev, systemPrompt: event.target.value }))
                  }
                  className="rounded-tile border border-line bg-elevated p-3 font-mono text-[11px] leading-5 text-ink focus:border-line-strong focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                Промпт запроса
                <textarea
                  rows={8}
                  value={params.userPrompt}
                  onChange={(event) =>
                    setParams((prev) => ({ ...prev, userPrompt: event.target.value }))
                  }
                  className="rounded-tile border border-line bg-elevated p-3 font-mono text-[11px] leading-5 text-ink focus:border-line-strong focus:outline-none"
                />
              </label>
            </div>
          </details>

          <button
            type="button"
            disabled={busy}
            onClick={() => fetch("/api/dev/moderation").then((res) => res.json()).then(setParams).catch(() => undefined)}
            className="h-9 rounded-full border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover disabled:opacity-50"
          >
            Вернуть прод-значения
          </button>
        </section>

        <section className="flex flex-col gap-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDropActive(false);
              void addFiles(event.dataTransfer.files);
            }}
            className={`rounded-card border border-dashed p-6 text-center transition-colors ${
              dropActive ? "border-brand bg-brand-soft" : "border-line bg-panel"
            }`}
          >
            <p className="text-sm text-muted">
              Перетащите фото сюда или{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-semibold text-ink underline underline-offset-2"
              >
                выберите файлы
              </button>{" "}
              — можно сразу несколько.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>

          {results.length === 0 ? (
            <p className="text-sm text-muted">
              Пока пусто. Загрузите фото — вердикт модели и решение по вашим порогам
              появятся в таблице.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {results.map((row) => {
                const assessment = row.assessment;
                const reasons = assessment ? reasonsFor(assessment, params) : [];
                return (
                  <li
                    key={row.id}
                    className="flex gap-4 rounded-card border border-line bg-panel p-4"
                  >
                    {row.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.image}
                        alt=""
                        className="size-16 shrink-0 rounded-tile object-cover"
                      />
                    ) : (
                      <div className="size-16 shrink-0 rounded-tile bg-elevated" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">
                          {row.name}
                        </span>
                        {row.status === "running" && (
                          <span className="text-xs text-muted">проверяем…</span>
                        )}
                        {row.status === "error" && (
                          <span className="text-xs text-brand">
                            {row.error ?? "ошибка"}
                          </span>
                        )}
                        {assessment && (
                          <>
                            <Verdict ok={reasons.length === 0} />
                            {row.prodAllowed !== null && row.prodAllowed !== undefined && (
                              <span className="text-xs text-faint">
                                прод: {row.prodAllowed ? "проходит" : "отказ"}
                              </span>
                            )}
                            {typeof row.elapsedMs === "number" && (
                              <span className="text-xs text-faint">
                                {row.elapsedMs} мс
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {assessment && (
                        <>
                          <p className="mt-2 text-xs text-muted">
                            лиц: {assessment.faces} · людей: {assessment.persons} ·
                            возраст: {assessment.youngestAge ?? "—"} · уверенность:{" "}
                            {assessment.confidence.toFixed(2)} · minor:{" "}
                            {assessment.minor ? "да" : "нет"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted">
                            {reasons.length === 0
                              ? "По вашим порогам фото проходит."
                              : `Отказ: ${reasons.join("; ")}.`}
                          </p>
                          {assessment.reason && (
                            <p className="mt-1 text-xs italic leading-5 text-faint">
                              «{assessment.reason}»
                            </p>
                          )}
                          {row.raw && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs text-faint hover:text-muted">
                                ответ модели
                              </summary>
                              <pre className="mt-1 overflow-x-auto rounded-tile bg-elevated p-3 text-[11px] leading-5 text-muted">
                                {row.raw}
                              </pre>
                            </details>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
