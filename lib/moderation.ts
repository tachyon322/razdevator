/**
 * Возрастные ворота на входе.
 *
 * Перед запуском генерации отправляем исходное фото в vision-LLM (NanoGPT) и
 * получаем оценку: есть ли на кадре человек и похож ли он на несовершеннолетнего.
 * Решение принимает код по порогу, а не «на слово» модели.
 *
 * Важно: это классификатор, а не гарантия. Оценка возраста по лицу ошибается,
 * особенно на подростках, поэтому ворота работают fail-closed: любая
 * неопределённость, ошибка сети или таймаут — это отказ, а не пропуск.
 */

import { nanogptBaseUrl } from "./nanogpt";

export class ModerationError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "ModerationError";
    this.status = status;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ModerationError(`Не задана переменная окружения ${name}`, 500);
  }
  return value;
}

/** Vision-модель для проверки исходного фото. */
export function moderationModel(): string {
  return (
    process.env.NANOGPT_MODERATION_MODEL ??
    "xiaomi/mimo-v2.6-flash-uncensored"
  );
}

/** Ворота можно выключить локально: MODERATION_ENABLED=false. */
export function moderationEnabled(): boolean {
  return process.env.MODERATION_ENABLED !== "false";
}

/**
 * Минимальный визуальный возраст. Не 18, а с запасом на ошибку оценки:
 * на подростках модель ошибается, поэтому берём запас по умолчанию 21.
 */
export function minApparentAge(): number {
  const raw = Number(process.env.MODERATION_MIN_AGE ?? 21);
  return Number.isFinite(raw) && raw >= 18 ? raw : 21;
}

/** Порог уверенности модели, ниже которого результат считаем ненадёжным. */
export const MIN_CONFIDENCE = 0.6;

export interface AgeAssessment {
  /** Сколько людей видно на фото. */
  persons: number;
  /** Сколько лиц распознано. */
  faces: number;
  /** Похож ли хоть один человек на несовершеннолетнего. */
  minor: boolean;
  /** Визуальный возраст самого младшего (null — модель не смогла оценить). */
  youngestAge: number | null;
  /** Уверенность модели 0..1. */
  confidence: number;
  /** Краткое пояснение (для лога и аудита). */
  reason: string;
}

const SYSTEM_PROMPT =
  "You are a strict safety classifier for an adults-only (18+) image service. " +
  "You inspect a reference photo before a generation runs. " +
  "Your only job is to judge whether every person in the photo is clearly an adult. " +
  "Age is often ambiguous: for teenagers you must be conservative and treat anyone " +
  "who could plausibly be under 18 as a minor. Never guess optimistically. " +
  "Answer with JSON only, no prose.";

const USER_PROMPT =
  "Analyze the image and return JSON with exactly these fields:\n" +
  '- "persons": integer, how many people are visible;\n' +
  '- "faces": integer, how many faces are visible;\n' +
  '- "youngestAge": integer or null, the apparent age of the youngest-looking person;\n' +
  '- "minor": boolean, true if any person appears to be under 18 or could plausibly be under 18;\n' +
  '- "confidence": number from 0 to 1 for your overall judgement;\n' +
  '- "reason": short string, one sentence.\n' +
  "If you cannot see any person, set persons and faces to 0 and minor to true.";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

function coerceAssessment(raw: unknown): AgeAssessment {
  const data = (raw ?? {}) as Record<string, unknown>;
  const int = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };
  const youngest = Number(data.youngestAge);
  // Fail-closed: поле minor считаем ложным только если модель явно сказала false,
  // иначе (пропуск, строка, мусор) — трактуем как «несовершеннолетний».
  const minor = !(data.minor === false || data.minor === "false");
  return {
    persons: Math.max(0, int(data.persons)),
    faces: Math.max(0, int(data.faces)),
    minor,
    youngestAge: Number.isFinite(youngest) ? Math.round(youngest) : null,
    confidence: Math.min(1, Math.max(0, Number(data.confidence) || 0)),
    reason: typeof data.reason === "string" ? data.reason.slice(0, 300) : "",
  };
}

/**
 * Спрашивает у vision-LLM оценку возраста. Выбрасывает `ModerationError`, если
 * ответ не получен или не разобран — вызывающий обязан трактовать это как отказ.
 */
export async function assessAge(
  imageDataUrl: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<AgeAssessment> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(`${nanogptBaseUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("NANOGPT_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: moderationModel(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: USER_PROMPT },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new ModerationError(
      `Проверка фото вернула ошибку ${res.status}`,
      res.status,
    );
  }

  const payload = (await res.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new ModerationError("Проверка фото не вернула результат.", 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ModerationError("Не удалось разобрать ответ проверки фото.", 502);
  }
  return coerceAssessment(parsed);
}

/** Политика: пропускать ли фото в генерацию. Fail-closed. */
export function isSourceAllowed(check: AgeAssessment): boolean {
  if (check.faces < 1) return false;
  if (check.minor) return false;
  if (check.confidence < MIN_CONFIDENCE) return false;
  if (check.youngestAge === null) return false;
  return check.youngestAge >= minApparentAge();
}

/** Причина отказа для клиента (без деталей, чтобы не подсказывать обход). */
export function rejectionMessage(): string {
  return "Не удалось подтвердить, что на фото совершеннолетний. Загрузите другое фото — только себя и только 18+.";
}
