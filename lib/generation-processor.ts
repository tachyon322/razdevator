/**
 * Фоновая обработка генерации: обращение к NanoGPT, скачивание результата,
 * сохранение в S3 и обновление записи в БД.
 *
 * Запускается из route handler через `after()` после отправки ответа клиенту.
 */

import {
  NanoGptError,
  fetchAsset,
  generateImage,
  getVideoStatus,
  submitVideo,
  toUserMessage,
  type ImageResolution,
  type VideoResolution,
} from "./nanogpt";
import {
  addAsset,
  deductBalance,
  incrementGenerationsUsed,
  nextAssetPosition,
  updateGeneration,
  type GenerationKind,
} from "./db";
import { buildImagePrompt, buildVideoPrompt, type Selections } from "./prompt";
import { buildGenerationKey, ensureBucket, putObject } from "./storage";

/** Таймаут ожидания готового видео (мс). */
const VIDEO_TIMEOUT_MS = 10 * 60 * 1000;
const VIDEO_POLL_MS = 5000;

export interface GenerationJob {
  generationId: string;
  userId: string;
  kind: GenerationKind;
  selections: Selections;
  keepFace: boolean;
  /** Разрешение: для image — 1k/1.5k/2k, для video — 480p/720p/1080p. */
  resolution: string;
  ratio: string;
  /** Только для image: количество кадров (1…4). */
  count?: number;
  /** Только для video. */
  duration?: number;
  audio?: boolean;
  /** Сколько рублей списать с баланса после успешной генерации. */
  costRub: number;
  /** Исходное фото как data URL (держится в памяти на время генерации). */
  sourceDataUrl: string;
}

/** Применяет списание только после успешной генерации. Экспортируется для тестов. */
export function applyBilling(job: GenerationJob): void {
  if (job.costRub > 0 && !deductBalance(job.userId, job.costRub)) {
    console.error(
      `[generation:${job.generationId}] не удалось списать ${job.costRub} ₽ с баланса`,
    );
  }
  incrementGenerationsUsed(job.userId, 1);
}

function clampCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(4, Math.max(1, Math.round(n)));
}

function clampDuration(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.min(15, Math.max(4, Math.round(n)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processGeneration(job: GenerationJob): Promise<void> {
  try {
    updateGeneration(job.generationId, { status: "processing", error: null });
    await ensureBucket();

    if (job.kind === "image") {
      await processImage(job);
    } else {
      await processVideo(job);
    }
  } catch (error) {
    console.error(`[generation:${job.generationId}] ошибка:`, error);
    updateGeneration(job.generationId, {
      status: "failed",
      error: toUserMessage(error),
    });
  }
}

async function processImage(job: GenerationJob): Promise<void> {
  const n = clampCount(job.count ?? 1);
  const prompt = buildImagePrompt(job.selections, { keepFace: job.keepFace });

  const result = await generateImage({
    prompt,
    imageDataUrl: job.sourceDataUrl,
    resolution: (job.resolution as ImageResolution) || "1k",
    aspectRatio: job.ratio,
    n,
  });

  updateGeneration(job.generationId, { prompt });

  let position = nextAssetPosition(job.generationId);
  for (const item of result.images) {
    const file = await fetchAsset(item.url);
    const key = buildGenerationKey(job.userId, file.contentType);
    await putObject(key, file.bytes, file.contentType);
    addAsset({
      generationId: job.generationId,
      kind: "image",
      s3Key: key,
      contentType: file.contentType,
      position: position++,
    });
  }

  updateGeneration(job.generationId, {
    status: "succeeded",
    costUsd: result.costUsd ?? null,
  });
  applyBilling(job);
}

async function processVideo(job: GenerationJob): Promise<void> {
  const duration = clampDuration(job.duration);
  const prompt = buildVideoPrompt(job.selections);

  const submitted = await submitVideo({
    prompt,
    imageDataUrl: job.sourceDataUrl,
    resolution: (job.resolution as VideoResolution) || "720p",
    durationSec: duration,
    aspectRatio: job.ratio,
    generateAudio: job.audio ?? false,
  });

  updateGeneration(job.generationId, {
    prompt,
    providerRunId: submitted.runId,
    costUsd: submitted.costUsd ?? null,
  });

  const videoUrl = await pollVideo(submitted.runId);
  const file = await fetchAsset(videoUrl);
  const key = buildGenerationKey(job.userId, file.contentType);
  await putObject(key, file.bytes, file.contentType);

  addAsset({
    generationId: job.generationId,
    kind: "video",
    s3Key: key,
    contentType: file.contentType,
    durationSec: duration,
    position: nextAssetPosition(job.generationId),
  });

  updateGeneration(job.generationId, { status: "succeeded" });
  applyBilling(job);
}

async function pollVideo(runId: string): Promise<string> {
  const deadline = Date.now() + VIDEO_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(VIDEO_POLL_MS);
    const status = await getVideoStatus(runId);

    if (status.status === "COMPLETED") {
      if (!status.videoUrl) {
        throw new NanoGptError("Провайдер не вернул ссылку на видео.", 502);
      }
      return status.videoUrl;
    }
    if (status.status === "FAILED" || status.status === "CANCELED") {
      throw new NanoGptError(
        status.userFriendlyError ??
          status.error ??
          "Провайдер не смог сгенерировать видео.",
        status.isNsfw ? 422 : 502,
        status.isNsfw ? "NSFW" : undefined,
      );
    }
  }

  throw new NanoGptError("Превышено время ожидания генерации видео.", 504);
}
