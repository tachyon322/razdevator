export interface StyleOption {
  id: string;
  label: string;
}

export interface StyleCategory {
  id: string;
  label: string;
  options: StyleOption[];
  /** Можно выбрать несколько вариантов (чекбоксы). */
  multiple?: boolean;
  /** Можно не выбирать ни одного — категория необязательная. */
  optional?: boolean;
}

export const STYLE_CATEGORIES: StyleCategory[] = [
  {
    id: "explicit",
    label: "Эротика",
    options: [
      { id: "original", label: "Как на фото" },
      { id: "erotic", label: "Эротический" },
      { id: "nude", label: "Без одежды" },
    ],
  },
  {
    id: "location",
    label: "Локация",
    options: [
      { id: "original", label: "Как на фото" },
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
      { id: "original", label: "Как на фото" },
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
      { id: "original", label: "Как на фото" },
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
      { id: "original", label: "Как на фото" },
      { id: "portrait", label: "Портрет" },
      { id: "full-body", label: "В полный рост" },
      { id: "back", label: "Со спины" },
    ],
  },
  {
    id: "extras",
    label: "Остальное",
    multiple: true,
    optional: true,
    options: [
      { id: "stockings", label: "Чулки" },
      { id: "police-cap", label: "Полицейская фуражка" },
      { id: "lace-gloves", label: "Кружевные перчатки" },
      { id: "choker", label: "Чокер" },
      { id: "sunglasses", label: "Солнцезащитные очки" },
      { id: "wide-brim-hat", label: "Широкополая шляпа" },
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

export type VideoResolution = "480p" | "720p" | "1080p";

export const VIDEO_RESOLUTIONS: { id: VideoResolution; label: string }[] = [
  { id: "480p", label: "480p" },
  { id: "720p", label: "720p" },
  { id: "1080p", label: "1080p" },
];

export const VIDEO_DURATIONS = [4, 5, 8, 10] as const;

export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

/** Режим Студии. */
export type StudioMode = "image" | "video";

/** Демо-кадры для витрины гостевой галереи. */
export const DEMO_RESULTS = [
  "/assets/img/banner_1.jpeg",
  "/assets/img/banner_2.jpeg",
  "/assets/img/banner_3.jpeg",
];

/** Выбранное значение категории: одиночный id, список id или пусто. */
export type SelectionValue = string | string[] | null;
export type Selections = Record<string, SelectionValue>;

/** Есть ли выбор в категории (для мультивыбора пустой массив — нет). */
export function hasSelection(value: SelectionValue | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

export function emptySelections(): Selections {
  return Object.fromEntries(
    STYLE_CATEGORIES.map((c) => [c.id, c.multiple ? [] : null]),
  );
}

export function styleLabel(
  categoryId: string,
  value: SelectionValue | undefined,
): string | null {
  const category = STYLE_CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return null;

  if (Array.isArray(value)) {
    const labels = value
      .map((id) => category.options.find((o) => o.id === id)?.label)
      .filter((label): label is string => Boolean(label));
    return labels.length ? labels.join(", ") : null;
  }

  if (!value) return null;
  return category.options.find((o) => o.id === value)?.label ?? null;
}

export const IMAGE_STAGES = [
  "Анализируем фото…",
  "Применяем стиль…",
  "Готовим кадр…",
];

export const VIDEO_STAGES = [
  "Отправляем фото в рендер…",
  "Ожидаем очередь…",
  "Рендерим видео…",
  "Собираем результат…",
];
