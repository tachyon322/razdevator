export interface StyleOption {
  id: string;
  label: string;
}

export interface StyleCategory {
  id: string;
  label: string;
  options: StyleOption[];
}

export const STYLE_CATEGORIES: StyleCategory[] = [
  {
    id: "location",
    label: "Локация",
    options: [
      { id: "beach", label: "Пляж" },
      { id: "penthouse", label: "Пентхаус" },
      { id: "night-city", label: "Ночной город" },
      { id: "pool", label: "Бассейн" },
      { id: "studio", label: "Студия" },
      { id: "nature", label: "Природа" },
    ],
  },
  {
    id: "look",
    label: "Образ",
    options: [
      { id: "business", label: "Деловой" },
      { id: "evening", label: "Вечерний" },
      { id: "casual", label: "Кэжуал" },
      { id: "swimwear", label: "Купальник" },
      { id: "robe", label: "Халат" },
      { id: "dress", label: "Платье" },
    ],
  },
  {
    id: "light",
    label: "Свет",
    options: [
      { id: "soft", label: "Мягкий" },
      { id: "rim", label: "Контровой" },
      { id: "neon", label: "Неон" },
      { id: "golden-hour", label: "Золотой час" },
    ],
  },
  {
    id: "angle",
    label: "Ракурс",
    options: [
      { id: "portrait", label: "Портрет" },
      { id: "full-body", label: "В полный рост" },
      { id: "back", label: "Со спины" },
    ],
  },
];

export type Ratio = "1:1" | "3:4" | "9:16";

export const RATIOS: { id: Ratio; label: string }[] = [
  { id: "1:1", label: "1:1" },
  { id: "3:4", label: "3:4" },
  { id: "9:16", label: "9:16" },
];

export type Count = 1 | 2 | 4;

export const COUNTS: Count[] = [1, 2, 4];

/** Демо-кадры «после», пока генерация не подключена. */
export const DEMO_RESULTS = [
  "/assets/img/banner_1.jpeg",
  "/assets/img/banner_2.jpeg",
  "/assets/img/banner_3.jpeg",
];

export function demoResult(seed: string): string {
  if (!seed) return DEMO_RESULTS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return DEMO_RESULTS[hash % DEMO_RESULTS.length];
}

/** Выбранное значение по каждому параметру (категории). */
export type Selections = Record<string, string | null>;

export function emptySelections(): Selections {
  return Object.fromEntries(STYLE_CATEGORIES.map((c) => [c.id, null]));
}

export function styleLabel(
  categoryId: string,
  optionId: string | null,
): string | null {
  if (!optionId) return null;
  const category = STYLE_CATEGORIES.find((c) => c.id === categoryId);
  return category?.options.find((o) => o.id === optionId)?.label ?? null;
}

export const STAGES = [
  "Анализируем фото…",
  "Применяем стиль…",
  "Готовим кадр…",
];
