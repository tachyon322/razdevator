import { after } from "next/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  MAX_UPLOAD_BYTES,
  buildSourceKey,
  ensureBucket,
  isSupportedImage,
  putObject,
} from "@/lib/storage";
import { createGeneration, getUserUsage } from "@/lib/db";
import { canAfford, formatPrice, generationCostRub } from "@/lib/plans";
import { imageModel, videoModel } from "@/lib/nanogpt";
import {
  processGeneration,
  type GenerationJob,
} from "@/lib/generation-processor";

export const runtime = "nodejs";
/** Генерация запускается в фоне через after(), но приём фото — в этом запросе. */
export const maxDuration = 60;

const IMAGE_RATIOS = new Set(["1:1", "3:4", "9:16"]);
const IMAGE_RESOLUTIONS = new Set(["1k", "1.5k", "2k"]);
const VIDEO_RESOLUTIONS = new Set(["480p", "720p", "1080p"]);
const COUNTS = new Set([1, 2, 4]);
const STYLE_CATEGORIES = ["location", "look", "light", "angle", "explicit"] as const;
/** Необязательные категории (мультивыбор, можно пропустить). */
const OPTIONAL_CATEGORIES = ["extras"] as const;

function parseSelections(
  raw: string | null,
): Record<string, string | string[]> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const source = parsed as Record<string, unknown>;
  const result: Record<string, string | string[]> = {};
  // «Образ» не учитывается при полной наготе — тогда его не требуем.
  const ignored = new Set<string>(source.explicit === "nude" ? ["look"] : []);

  for (const category of STYLE_CATEGORIES) {
    const value = source[category];
    if (ignored.has(category)) {
      if (typeof value === "string" && value) result[category] = value;
      continue;
    }
    if (typeof value !== "string" || !value) return null;
    result[category] = value;
  }

  for (const category of OPTIONAL_CATEGORIES) {
    const value = source[category];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      const ids = value.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      );
      if (ids.length) result[category] = ids;
    }
  }

  return result;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ message: "Требуется авторизация" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { message: "Ожидается multipart/form-data" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Поле file не найдено" }, { status: 400 });
  }
  if (!isSupportedImage(file.type)) {
    return NextResponse.json(
      { message: "Поддерживаются только JPG, PNG или WebP." },
      { status: 400 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { message: "Файл слишком большой. Загрузите фото поменьше." },
      { status: 400 },
    );
  }

  const kindRaw = form.get("kind");
  const kind = kindRaw === "video" ? "video" : kindRaw === "image" ? "image" : null;
  if (!kind) {
    return NextResponse.json(
      { message: "Укажите kind: image или video." },
      { status: 400 },
    );
  }

  const selections = parseSelections(form.get("selections") as string | null);
  if (!selections) {
    return NextResponse.json(
      { message: "Выберите локацию, образ, свет и ракурс." },
      { status: 400 },
    );
  }

  const ratioRaw = String(form.get("ratio") ?? "3:4");
  const ratio = IMAGE_RATIOS.has(ratioRaw) ? ratioRaw : "3:4";
  const keepFace = String(form.get("keepFace") ?? "true") !== "false";

  let resolution: string;
  let count = 1;
  let duration: number | undefined;
  let audio = false;

  if (kind === "image") {
    const countRaw = Number(form.get("count") ?? 1);
    count = COUNTS.has(countRaw) ? countRaw : 1;
    const resolutionRaw = String(form.get("resolution") ?? "1k");
    resolution = IMAGE_RESOLUTIONS.has(resolutionRaw) ? resolutionRaw : "1k";
  } else {
    const resolutionRaw = String(form.get("resolution") ?? "720p");
    resolution = VIDEO_RESOLUTIONS.has(resolutionRaw) ? resolutionRaw : "720p";
    const durationRaw = Number(form.get("duration") ?? 5);
    duration = Number.isFinite(durationRaw)
      ? Math.min(15, Math.max(4, Math.round(durationRaw)))
      : 5;
    audio = String(form.get("audio") ?? "false") === "true";
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const sourceDataUrl = `data:${file.type};base64,${Buffer.from(buffer).toString("base64")}`;

  // Оплата: только с баланса — бесплатных пробных генераций нет.
  // Данные читаем свежими, в обход cookie-кеша сессии.
  const usage = getUserUsage(session.user.id);
  const balance = usage?.balanceRub ?? 0;
  const costRub = generationCostRub(kind, count);

  if (!canAfford(balance, costRub)) {
    return NextResponse.json(
      {
        message: `Недостаточно средств: нужно ${formatPrice(costRub)}, на балансе ${formatPrice(balance)}. Пополните баланс, чтобы продолжить.`,
      },
      { status: 402 },
    );
  }

  try {
    await ensureBucket();
    const sourceKey = buildSourceKey(session.user.id, file.type);
    await putObject(sourceKey, buffer, file.type);

    const params = {
      selections,
      keepFace,
      ratio,
      costRub,
      ...(kind === "image"
        ? { count, resolution }
        : { resolution, duration, audio }),
    };

    const generation = createGeneration({
      userId: session.user.id,
      kind,
      model: kind === "image" ? imageModel() : videoModel(),
      params,
      sourceKey,
      sourceContentType: file.type,
    });

    const job: GenerationJob = {
      generationId: generation.id,
      userId: session.user.id,
      kind,
      selections,
      keepFace,
      resolution,
      ratio,
      count,
      duration,
      audio,
      costRub,
      sourceDataUrl,
    };

    after(() => processGeneration(job));

    return NextResponse.json(
      { id: generation.id, status: "pending", costRub },
      { status: 202 },
    );
  } catch (error) {
    console.error("[generate] ошибка запуска:", error);
    return NextResponse.json(
      { message: "Не удалось запустить генерацию" },
      { status: 502 },
    );
  }
}
