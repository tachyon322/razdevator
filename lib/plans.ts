export type PlanId = "free" | "basic" | "premium";

export interface Plan {
  id: PlanId;
  name: string;
  /** Цена в рублях за месяц (0 для бесплатного). */
  price: number;
  /** Лимит генераций в месяц. */
  limit: number;
  note: string;
  tagline: string;
  features: string[];
  /** Показывать ли тариф на странице /pricing. */
  purchasable: boolean;
  highlighted?: boolean;
  cta: string;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Бесплатный",
    price: 0,
    limit: 3,
    note: "пробный доступ",
    tagline: "Познакомиться с сервисом.",
    features: ["3 пробные генерации", "Базовые стили"],
    purchasable: false,
    cta: "Текущий тариф",
  },
  basic: {
    id: "basic",
    name: "Базовый",
    price: 2000,
    limit: 100,
    note: "в месяц",
    tagline: "Для регулярных экспериментов с образами.",
    features: [
      "100 генераций в месяц",
      "Все базовые стили",
      "Экспорт без водяных знаков",
      "Стандартная очередь",
    ],
    purchasable: true,
    highlighted: true,
    cta: "Выбрать Базовый",
  },
  premium: {
    id: "premium",
    name: "Премиум",
    price: 5000,
    limit: 500,
    note: "в месяц",
    tagline: "Для тех, кому нужен максимум качества.",
    features: [
      "500 генераций в месяц",
      "Все стили и локации",
      "Максимальное разрешение",
      "Приоритетная очередь",
      "Ранний доступ к новым стилям",
    ],
    purchasable: true,
    cta: "Выбрать Премиум",
  },
};

export const DEFAULT_PLAN: PlanId = "free";

/** Тарифы, которые показываем на /pricing. */
export const PURCHASABLE_PLANS: Plan[] = Object.values(PLANS).filter(
  (plan) => plan.purchasable,
);

export function getPlan(id?: string | null): Plan {
  if (id && id in PLANS) return PLANS[id as PlanId];
  return PLANS[DEFAULT_PLAN];
}

export function formatPrice(price: number): string {
  return `${price.toLocaleString("ru-RU")} ₽`;
}
