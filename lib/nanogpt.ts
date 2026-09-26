/**
 * Клиент NanoGPT.
 *
 * Обёртки над двумя путями провайдера:
 *  - изображения — OpenAI-совместимый POST /v1/images/generations (синхронный);
 *  - видео — асинхронный POST /generate-video + polling GET /video/status.
 *
 * Тело и форматы ответов зафиксированы живыми вызовами (см. план
 * /home/denis/.opencode/plan/nanogpt-generation-pipeline.md, раздел 2).
 */

export class NanoGptError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 502, code?: string) {
    super(message);
    this.name = "NanoGptError";
    this.status = status;
    this.code = code;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

/** База API без завершающего слэша. */
export function nanogptBaseUrl(): string {
  return (process.env.NANOGPT_BASE_URL ?? "https://nano-gpt.com/api").replace(
    /\/+$/,
    "",
  );
}

/** Модель изображения (image-to-image по исходному фото). */
export function imageModel(): string {
  return process.env.NANOGPT_IMAGE_MODEL ?? "qwen-image-2.1/edit-lora";
}

/** Модель видео (image-to-video). */
export function videoModel(): string {
  return process.env.NANOGPT_VIDEO_MODEL ??
    "bytedance/seedance-2.0/image-to-video-spicy";
}

async function parseError(res: Response): Promise<NanoGptError> {
  let message = `NanoGPT вернул ошибку ${res.status}`;
  let code: string | undefined;
  try {
    const body = (await res.json()) as {
      error?: string | { message?: string };
      message?: string;
      code?: string;
    };
    code = body.code;
    if (typeof body.error === "string") message = body.error;
    else if (body.error?.message) message = body.error.message;
    else if (body.message) message = body.message;
  } catch {
    // тело не JSON — оставляем общий текст
  }
  return new NanoGptError(message, res.status, code);
}

/** Разбирает ответ NanoGPT на «человекопонятную» ошибку. */
export function toUserMessage(error: unknown): string {
  if (error instanceof NanoGptError) {
    if (error.code === "INVALID_IMAGE_INPUT") {
      return "Не удалось прочитать исходное фото. Загрузите другой файл.";
    }
    if (/nsfw|safety|moderation/i.test(error.message)) {
      return "Провайдер отклонил контент по правилам безопасности. Измените фото или стиль.";
    }
    if (error.status === 402 || /balance|credit|payment/i.test(error.message)) {
      return "Закончился баланс генераций. Пополните счёт провайдера.";
    }
    if (error.status === 429) {
      return "Провайдер перегружен. Попробуйте ещё раз через минуту.";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Не удалось сгенерировать результат. Попробуйте ещё раз.";
}

// --- Изображения -----------------------------------------------------------

export type ImageResolution = "1k" | "1.5k" | "2k";

export interface GeneratedImageItem {
  url: string;
  storageKey?: string;
}

export interface GeneratedImage {
  images: GeneratedImageItem[];
  costUsd?: number;
  requestId?: string;
}

export interface GenerateImageInput {
  prompt: string;
  imageDataUrl: string;
  resolution?: ImageResolution;
  aspectRatio?: string;
  /** 1…4. */
  n?: number;
}

export async function generateImage(
  input: GenerateImageInput,
): Promise<GeneratedImage> {
  const res = await fetch(`${nanogptBaseUrl()}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("NANOGPT_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: imageModel(),
      prompt: input.prompt,
      imageDataUrls: [input.imageDataUrl],
      size: input.resolution ?? "1k",
      aspect_ratio: input.aspectRatio ?? "3:4",
      n: input.n ?? 1,
      response_format: "url",
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) throw await parseError(res);

  const data = (await res.json()) as {
    data?: { url?: string; storageKey?: string }[];
    cost?: number;
    requestId?: string;
    id?: string;
  };

  const images: GeneratedImageItem[] = (data.data ?? [])
    .filter((item) => Boolean(item.url))
    .map((item) => ({ url: item.url as string, storageKey: item.storageKey }));

  if (images.length === 0) {
    throw new NanoGptError("NanoGPT не вернул изображения.", 502);
  }

  return { images, costUsd: data.cost, requestId: data.requestId ?? data.id };
}

// --- Видео -----------------------------------------------------------------

export type VideoResolution = "480p" | "720p" | "1080p";

export interface SubmitVideoInput {
  prompt: string;
  imageDataUrl: string;
  resolution?: VideoResolution;
  /** 4…15 секунд. */
  durationSec?: number;
  aspectRatio?: string;
  generateAudio?: boolean;
  seed?: number;
}

export interface SubmittedVideo {
  runId: string;
  costUsd?: number;
}

export async function submitVideo(
  input: SubmitVideoInput,
): Promise<SubmittedVideo> {
  const res = await fetch(`${nanogptBaseUrl()}/generate-video`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("NANOGPT_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: videoModel(),
      prompt: input.prompt,
      imageDataUrl: input.imageDataUrl,
      resolution: input.resolution ?? "720p",
      duration: String(input.durationSec ?? 5),
      aspect_ratio: input.aspectRatio ?? "3:4",
      generateAudio: input.generateAudio ?? false,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) throw await parseError(res);

  const data = (await res.json()) as {
    runId?: string;
    id?: string;
    cost?: number;
  };
  const runId = data.runId ?? data.id;
  if (!runId) throw new NanoGptError("NanoGPT не вернул идентификатор задачи.", 502);

  return { runId, costUsd: data.cost };
}

export type VideoStatus =
  | "IN_QUEUE"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED";

export interface VideoStatusResult {
  status: VideoStatus;
  videoUrl?: string;
  error?: string;
  isNsfw?: boolean;
  userFriendlyError?: string;
}

export async function getVideoStatus(
  runId: string,
): Promise<VideoStatusResult> {
  const res = await fetch(
    `${nanogptBaseUrl()}/video/status?requestId=${encodeURIComponent(runId)}`,
    {
      headers: { "x-api-key": requireEnv("NANOGPT_API_KEY") },
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!res.ok) throw await parseError(res);

  const payload = (await res.json()) as {
    status?: string;
    data?: {
      status?: string;
      error?: string;
      isNSFWError?: boolean;
      userFriendlyError?: string;
      output?: { video?: { url?: string }; videoUrls?: string[] };
    };
  };

  const data = payload.data ?? {};
  const status = (data.status ?? payload.status ?? "IN_QUEUE").toUpperCase() as VideoStatus;

  return {
    status,
    videoUrl: data.output?.video?.url ?? data.output?.videoUrls?.[0],
    error: data.error,
    isNsfw: data.isNSFWError,
    userFriendlyError: data.userFriendlyError,
  };
}

// --- Скачивание результата -------------------------------------------------

/** Расширение по MIME-типу (для ключа в S3). */
export function extensionForContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return map[contentType.toLowerCase()] ?? "bin";
}

function guessContentType(url: string): string {
  const path = url.split("?")[0].toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".mp4")) return "video/mp4";
  if (path.endsWith(".webm")) return "video/webm";
  return "image/jpeg";
}

/** Скачивает готовый файл провайдера (по подписанной ссылке) в память. */
export async function fetchAsset(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new NanoGptError("Некорректная ссылка на результат.", 502);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new NanoGptError("Недопустимая схема ссылки на результат.", 502);
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) {
    throw new NanoGptError(
      `Не удалось скачать результат (${res.status}).`,
      502,
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const header = res.headers.get("content-type")?.split(";")[0]?.trim();
  return { bytes, contentType: header || guessContentType(url) };
}
