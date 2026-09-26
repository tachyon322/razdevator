import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "../../components/icons";
import { PURCHASABLE_PLANS, formatPrice } from "@/lib/plans";

export const metadata = {
  title: "Тарифы — Раздеватор",
  description:
    "Два месячных тарифа: Базовый за 2000 ₽ и Премиум за 5000 ₽. Оплата картой, отмена в любой момент.",
};

const NOTES = [
  "Оплата картой, списание раз в месяц",
  "Отмена в любой момент без звонков и писем",
  "Неудачная генерация не расходует лимит",
];

export default function PricingPage() {
  return (
    <main className="flex-1 py-14 sm:py-20">
      <div className="container-page">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Тарифы
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            Два простых месячных тарифа. Начните с Базового — при необходимости
            перейдите на Премиум.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
          {PURCHASABLE_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={[
                "relative flex flex-col rounded-card border p-6 sm:p-7",
                plan.highlighted
                  ? "border-brand/50 bg-panel shadow-[0_24px_60px_-30px_rgba(225,29,72,0.8)]"
                  : "border-line bg-panel",
              ].join(" ")}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-6 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
                  Популярный
                </span>
              )}

              <h2 className="text-lg font-semibold text-ink">{plan.name}</h2>
              <p className="mt-1 text-sm text-faint">{plan.tagline}</p>

              <p className="mt-5 flex items-baseline gap-2">
                <span className="font-display text-3xl font-extrabold tracking-tight text-ink">
                  {formatPrice(plan.price)}
                </span>
                <span className="text-sm text-faint">{plan.note}</span>
              </p>

              <ul className="mt-6 flex flex-1 flex-col gap-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm text-muted"
                  >
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" />
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href="#create"
                className={[
                  "mt-7 inline-flex h-12 items-center justify-center rounded-full text-sm font-semibold transition-transform hover:-translate-y-0.5",
                  plan.highlighted
                    ? "bg-[linear-gradient(135deg,#e11d48,#9f1239)] text-white shadow-[0_14px_40px_-16px_rgba(225,29,72,0.9)]"
                    : "border border-line-strong text-ink hover:bg-panel-hover",
                ].join(" ")}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        <ul className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-3">
          {NOTES.map((note) => (
            <li
              key={note}
              className="flex items-start gap-2.5 rounded-tile border border-line bg-panel px-4 py-3 text-sm text-muted"
            >
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" />
              {note}
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-12 flex max-w-4xl flex-col items-start justify-between gap-4 rounded-panel border border-brand/40 bg-[linear-gradient(135deg,rgba(225,29,72,0.22),rgba(159,18,57,0.08))] p-7 sm:flex-row sm:items-center sm:p-8">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              Не уверены, какой тариф нужен?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Начните с Базового и поменяйте план в один клик.
            </p>
          </div>
          <Link
            href="/faq"
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-line-strong px-6 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
          >
            Частые вопросы
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}
