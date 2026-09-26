/**
 * Клиентская подготовка фото к загрузке: проверка лимитов, ресайз и
 * перекодирование в JPEG. Модуль используется только в браузере — все
 * обращения к window/document происходят внутри функций.
 */

/** Максимальный размер входного файла (до сжатия). */
export const MAX_INPUT_BYTES = 5 * 1024 * 1024;
/** Длинная сторона после ресайза (без апскейла). */
export const MAX_SIDE = 2048;
/** Минимальная сторона исходника. */
export const MIN_SIDE = 512;
/** Качество JPEG основной попытки. */
export const JPEG_QUALITY = 0.85;
/** Если оригинал уже укладывается в эти рамки — не пережимаем. */
export const SKIP_REENCODE_BYTES = 1.5 * 1024 * 1024;
/** Жёсткий потолок результата: выше — понижаем качество/размер. */
export const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
/** Поддерживаемые MIME-типы на входе. */
export const INPUT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const FALLBACK_QUALITIES = [JPEG_QUALITY, 0.75, 0.65];

export interface PreparedImage {
  /** Готовый к отправке файл (JPEG, либо оригинал, если пережатие не нужно). */
  file: File;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  recompressed: boolean;
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

/**
 * Декодирует файл в изображение. Предпочитает createImageBitmap с учётом
 * EXIF-ориентации, при недоступности — <img>.
 */
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // пробуем фоллбэк ниже
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Не удалось прочитать фото. Загрузите другой файл.");
  }
}

type Surface =
  | { kind: "offscreen"; canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D }
  | { kind: "dom"; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };

function createSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx) return { kind: "offscreen", canvas, ctx };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не удалось подготовить фото. Попробуйте ещё раз.");
  return { kind: "dom", canvas, ctx };
}

function encode(surface: Surface, quality: number): Promise<Blob> {
  if (surface.kind === "offscreen") {
    return surface.canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    surface.canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Не удалось сжать фото. Попробуйте ещё раз.")),
      "image/jpeg",
      quality,
    );
  });
}

function renameToJpg(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "photo"}.jpg`;
}

/**
 * Валидирует и при необходимости сжимает фото перед отправкой.
 * Бросает Error с готовым к показу текстом при некорректном файле.
 */
export async function prepareImageUpload(file: File): Promise<PreparedImage> {
  if (!(INPUT_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("Поддерживаются только JPG, PNG или WebP.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Файл больше 5 МБ. Загрузите фото поменьше.");
  }

  const decoded = await decode(file);
  try {
    const { width, height } = decoded;
    if (Math.min(width, height) < MIN_SIDE) {
      throw new Error(`Минимальное разрешение — ${MIN_SIDE}×${MIN_SIDE}.`);
    }

    // Уже небольшое фото отправляем без перекодирования — без потери качества.
    if (Math.max(width, height) <= MAX_SIDE && file.size <= SKIP_REENCODE_BYTES) {
      return {
        file,
        width,
        height,
        originalSize: file.size,
        compressedSize: file.size,
        recompressed: false,
      };
    }

    // Масштаб до MAX_SIDE по длинной стороне (без апскейла).
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const baseWidth = Math.max(1, Math.round(width * scale));
    const baseHeight = Math.max(1, Math.round(height * scale));

    let shrink = 1;
    let blob: Blob | null = null;
    const attempts = FALLBACK_QUALITIES.length + 2;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const targetWidth = Math.max(1, Math.round(baseWidth * shrink));
      const targetHeight = Math.max(1, Math.round(baseHeight * shrink));
      const surface = createSurface(targetWidth, targetHeight);
      // Белый фон: PNG с прозрачностью не даст чёрных полей в JPEG.
      surface.ctx.fillStyle = "#ffffff";
      surface.ctx.fillRect(0, 0, targetWidth, targetHeight);
      surface.ctx.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);

      const quality =
        FALLBACK_QUALITIES[Math.min(attempt, FALLBACK_QUALITIES.length - 1)];
      const candidate = await encode(surface, quality);
      if (candidate.size <= MAX_OUTPUT_BYTES || attempt === attempts - 1) {
        blob = candidate;
        break;
      }
      shrink *= 0.75;
    }

    if (!blob) {
      throw new Error("Не удалось сжать фото. Попробуйте ещё раз.");
    }

    const out = new File([blob], renameToJpg(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    return {
      file: out,
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      originalSize: file.size,
      compressedSize: out.size,
      recompressed: true,
    };
  } finally {
    decoded.close();
  }
}
