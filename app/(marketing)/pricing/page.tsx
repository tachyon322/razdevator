import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  ImageIcon,
  VideoIcon,
} from "../../components/icons";
import { BuyPackButton } from "../../components/BuyPackButton";
import { CreateOrTopUpButton } from "../../components/CreateOrTopUpButton";
import { PACKS, PRICES, formatPrice, packCreditRub } from "@/lib/plans";
import { customTopUpVisible, getSiteSettings } from "@/lib/settings";

// Витрина зависит от настроек админки — рендерим на каждый запрос.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Цены — Раздеватор",
  description:
    "Фото — 100 ₽, видео — 250 ₽ за генерацию. Пакеты за 2000 ₽ и 5000 ₽ со скидкой. Оплата с баланса, без подписки.",
};

const PER_ITEM = [
  {
    id: "image",
    name: "Фото",
    icon: ImageIcon,
    price: PRICES.image,
    note: "за одно изображение",
    features: [
      "Кадр в высоком разрешении",
      "Любой из 20+ стилей",
      "Без водяных знаков",
      "Сохраняется в галерею",
    ],
  },
  {
    id: "video",
    name: "Видео",
    icon: VideoIcon,
    price: PRICES.video,
    note: "за один ролик",
    features: [
      "Ролик до 15 секунд",
      "480p, 720p или 1080p",
      "Звук по желанию",
      "Сохраняется в галерею",
    ],
  },
];

const NOTES = [
  "Оплата за результат: фото и видео считаются отдельно",
  "Пакеты выгоднее поштучной цены",
  "Неудачная генерация не расходует оплату",
];

export default function PricingPage() {
  const settings = getSiteSettings();
  const showPerItem = settings.showPerItemCards;
  const customTopUp = customTopUpVisible(settings);

  return (
    <main className="flex-1 py-14 sm:py-20">
      <div className="container-page">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Цены
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            {showPerItem ? (
              <>
                Платите за результат: фото — {formatPrice(PRICES.image)}, видео —{" "}
                {formatPrice(PRICES.video)}. А если генерируете много — берите
                пакет со скидкой.
              </>
            ) : (
              "Выберите пакет: на баланс зачислится больше, чем вы заплатите, а генерации спишутся с него по мере использования."
            )}
          </p>
        </div>

        {/* Цена за одну генерацию */}
        {showPerItem && (
          <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
            {PER_ITEM.map((item) => (
              <div
                key={item.id}
                className="flex flex-col rounded-card border border-line bg-panel p-6 sm:p-7"
              >
                <span className="grid size-11 place-items-center rounded-tile bg-brand-soft text-brand">
                  <item.icon className="size-5" />
                </span>

                <h2 className="mt-4 text-lg font-semibold text-ink">
                  {item.name}
                </h2>

                <p className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-extrabold tracking-tight text-ink">
                    {formatPrice(item.price)}
                  </span>
                  <span className="text-sm text-faint">{item.note}</span>
                </p>

                <ul className="mt-6 flex flex-1 flex-col gap-3">
                  {item.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm text-muted"
                    >
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <CreateOrTopUpButton
                  price={item.price}
                  label={`Создать ${item.id === "video" ? "видео" : "фото"}`}
                  className="mt-7 inline-flex h-12 items-center justify-center rounded-full border border-line-strong text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
                />
              </div>
            ))}
          </div>
        )}

        {/* Паки */}
        <div className={`mx-auto max-w-4xl ${showPerItem ? "mt-14" : "mt-10"}`}>
          <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
            Пакеты со скидкой
          </h2>
          <p className="mt-2 text-sm text-muted">
            Больше генераций за меньшую цену — когда фото и видео нужно много.
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {PACKS.map((pack) => (
              <div
                key={pack.id}
                className={[
                  "relative flex flex-col rounded-card border p-6 sm:p-7",
                  pack.highlighted
                    ? "border-brand/50 bg-panel shadow-[0_24px_60px_-30px_rgba(225,29,72,0.8)]"
                    : "border-line bg-panel",
                ].join(" ")}
              >
                {pack.highlighted && (
                  <span className="absolute -top-3 left-6 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
                    Выгоднее
                  </span>
                )}

                <h3 className="text-lg font-semibold text-ink">{pack.name}</h3>
                <p className="mt-1 text-sm text-faint">{pack.tagline}</p>

                <p className="mt-5 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-extrabold tracking-tight text-ink">
                    {formatPrice(pack.price)}
                  </span>
                  <span className="text-sm text-faint">{pack.note}</span>
                </p>

                <ul className="mt-6 flex flex-1 flex-col gap-3">
                  {pack.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm text-muted"
                    >
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <p className="mt-6 text-xs text-faint">
                  На баланс зачислится {formatPrice(packCreditRub(pack))}
                </p>
                <BuyPackButton
                  packId={pack.id}
                  label={pack.cta}
                  className={[
                    "mt-2 inline-flex h-12 w-full items-center justify-center rounded-full text-sm font-semibold transition-transform hover:-translate-y-0.5",
                    pack.highlighted
                      ? "bg-[linear-gradient(135deg,#e11d48,#9f1239)] text-white shadow-[0_14px_40px_-16px_rgba(225,29,72,0.9)]"
                      : "border border-line-strong text-ink hover:bg-panel-hover",
                  ].join(" ")}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Оплата с баланса */}
        <div className="mx-auto mt-10 max-w-4xl rounded-panel border border-line bg-elevated px-6 py-5 text-center text-sm text-muted">
          {customTopUp
            ? "Оплата с баланса: пополните его на нужную сумму и платите только за фактические генерации — лимитов и подписок нет."
            : "Оплата с баланса: сумма пакета зачисляется на баланс, а генерации списываются с него по факту — лимитов и подписок нет."}
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
              Не уверены, что выбрать?
            </h2>
            <p className="mt-2 text-sm text-muted">
              {customTopUp
                ? "Пополните баланс и генерируйте — пакет можно взять позже."
                : "Ответы про пакеты, оплату и генерации — в разделе вопросов."}
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
