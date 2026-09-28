export interface Pack {
  id: string;
  name: string;
  /** Цена пака в рублях. */
  price: number;
  /** Сколько фото входит в пак. */
  images: number;
  /** Сколько видео входит в пак. */
  videos: number;
  note: string;
  tagline: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
}

/** Цена одной генерации в рублях. */
export const PRICES = {
  image: 100,
  video: 250,
} as const;

/** Бесплатный пробный доступ: сколько генераций даём сразу после регистрации. */
export const TRIAL = {
  name: "Пробный доступ",
  limit: 3,
} as const;

/** Паки со скидкой относительно поштучной цены. */
export const PACKS: Pack[] = [
  {
    id: "start",
    name: "Пакет 2000",
    price: 2000,
    images: 20,
    videos: 2,
    note: "разовая покупка",
    tagline: "Небольшой запас кадров для первых экспериментов.",
    features: [
      "20 фото",
      "2 видео",
      "Выгода 500 ₽",
      "Экспорт без водяных знаков",
    ],
    cta: "Купить за 2000 ₽",
  },
  {
    id: "studio",
    name: "Пакет 5000",
    price: 5000,
    images: 55,
    videos: 5,
    note: "разовая покупка",
    tagline: "Для тех, кто генерирует регулярно и с запасом.",
    features: [
      "55 фото",
      "5 видео",
      "Выгода 1750 ₽",
      "Приоритетная очередь",
    ],
    highlighted: true,
    cta: "Купить за 5000 ₽",
  },
];

/** Пресеты быстрого пополнения баланса (в рублях). */
export const TOPUPS = [500, 1000, 2000, 5000] as const;

/** Минимальная сумма ручного пополнения баланса (в рублях). */
export const MIN_TOPUP = 300;

export function formatPrice(price: number): string {
  return `${price.toLocaleString("ru-RU")} ₽`;
}

/** Стоимость запроса в рублях: фото — за каждый кадр, видео — фиксированно. */
export function generationCostRub(
  kind: "image" | "video",
  count = 1,
): number {
  if (kind === "video") return PRICES.video;
  return PRICES.image * Math.max(1, Math.round(count));
}

/**
 * Как списывается генерация: сначала бесплатные пробные, затем деньги с баланса.
 * Решение принимается в /api/generate и передаётся в фоновую обработку.
 */
export interface Billing {
  mode: "trial" | "balance";
  /** Сколько единиц пробного лимита списать (0 при оплате деньгами). */
  units: number;
  /** Сколько рублей списать с баланса (0 для пробной генерации). */
  costRub: number;
}

/**
 * Решает, чем оплатить запрос: пробным лимитом, деньгами с баланса или
 * отказать. Возвращает `null`, если не хватает ни пробных генераций, ни денег.
 */
export function resolveBilling(input: {
  kind: "image" | "video";
  count: number;
  /** Сколько единиц пробного лимита осталось. */
  trialLeft: number;
  /** Баланс в рублях. */
  balance: number;
}): Billing | null {
  const units = generationWeight(input.kind, input.count);
  if (input.trialLeft >= units) {
    return { mode: "trial", units, costRub: 0 };
  }
  const costRub = generationCostRub(input.kind, input.count);
  if (input.balance >= costRub) {
    return { mode: "balance", units: 0, costRub };
  }
  return null;
}

/** Сколько единиц пробного лимита списывает одна генерация. */
export const GENERATION_WEIGHTS = { image: 1, video: 3 } as const;

export function generationWeight(
  kind: "image" | "video",
  count = 1,
): number {
  if (kind === "video") return GENERATION_WEIGHTS.video;
  return GENERATION_WEIGHTS.image * Math.max(1, count);
}
