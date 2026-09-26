import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  GridIcon,
  SparkIcon,
  UploadIcon,
} from "@/app/components/icons";
import { DEMO_RESULTS, STYLE_CATEGORIES } from "@/app/components/create/presets";

export const metadata = {
  title: "Галерея — Раздеватор",
  description:
    "Примеры кадров, созданных в Студии: локации, образы, свет и ракурсы. Вымышленные изображения, созданные AI.",
};

const CARDS = STYLE_CATEGORIES.length
  ? Array.from({ length: 12 }, (_, i) => {
      const opts = (id: string) =>
        STYLE_CATEGORIES.find((c) => c.id === id)?.options ?? [];
      const pick = (id: string, offset: number) => {
        const list = opts(id);
        return list.length ? list[offset % list.length].label : "";
      };

      return {
        id: i,
        image: DEMO_RESULTS[i % DEMO_RESULTS.length],
        location: pick("location", i * 2 + 1),
        look: pick("look", i),
        light: pick("light", i + 3),
        angle: pick("angle", i),
        ratio: (["3/4", "1/1", "9/16"] as const)[i % 3],
      };
    })
  : [];

const RATIO_CLASS = {
  "3/4": "aspect-[3/4]",
  "1/1": "aspect-square",
  "9/16": "aspect-[9/16]",
} as const;

const HIGHLIGHTS = [
  { icon: SparkIcon, label: "Более 20 стилей" },
  { icon: GridIcon, label: "Ракурсы 1:1, 3:4 и 9:16" },
  { icon: UploadIcon, label: "Готово примерно за 30 секунд" },
];

export default function GalleryPage() {
  return (
    <main className="flex-1 py-14 sm:py-20">
      <div className="container-page">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-xs font-medium text-muted">
            <GridIcon className="size-4 text-brand" />
            Галерея
          </span>

          <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Галерея кадров
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            Примеры того, как меняется кадр при разных локациях, образах, свете
            и ракурсах. Каждый кадр собирается в Студии из одного вашего фото.
          </p>
        </div>

        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
          {HIGHLIGHTS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-2 text-sm text-muted"
            >
              <Icon className="size-4 text-brand" />
              {label}
            </li>
          ))}
        </ul>

        <div className="mt-10 columns-2 gap-4 sm:columns-3 lg:columns-4">
          {CARDS.map((card) => {
            const meta = [card.location, card.light, card.angle]
              .filter(Boolean)
              .join(" · ");

            return (
              <Link
                key={card.id}
                href="/create"
                aria-label={`Повторить стиль «${card.look}» в Студии`}
                className="group mb-4 block break-inside-avoid overflow-hidden rounded-card border border-line bg-panel transition-colors hover:border-line-strong"
              >
                <div
                  className={`relative w-full overflow-hidden ${RATIO_CLASS[card.ratio]}`}
                >
                  <Image
                    src={card.image}
                    alt={`Пример кадра: ${card.look}, ${card.location}`}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />

                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(10,9,11,0.92),transparent_58%)]"
                  />

                  <span className="absolute left-3 top-3 rounded-full border border-line-strong bg-canvas/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink backdrop-blur">
                    {card.location}
                  </span>
                  <span className="absolute right-3 top-3 rounded-full border border-brand/40 bg-brand-soft px-2.5 py-1 text-[10px] font-semibold text-ink backdrop-blur">
                    18+
                  </span>

                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="font-display text-base font-bold tracking-tight text-white">
                      {card.look}
                    </p>
                    <p className="mt-1 text-[11px] text-white/70">
                      {card.ratio.replace("/", ":")} · {meta}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                      Повторить в Студии
                      <ArrowRightIcon className="size-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <p className="mt-8 rounded-tile border border-line bg-elevated px-4 py-3 text-center text-xs text-faint">
          Демо-режим: генерация пока не подключена, показаны примеры кадров.
          Все изображения вымышлены и созданы AI.
        </p>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-panel border border-brand/40 bg-[linear-gradient(135deg,rgba(225,29,72,0.22),rgba(159,18,57,0.08))] p-7 sm:flex-row sm:items-center sm:p-8">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              Сделайте свой кадр
            </h2>
            <p className="mt-2 text-sm text-muted">
              Загрузите фото, выберите стиль — результат примерно за 30 секунд.
            </p>
          </div>
          <Link
            href="/create"
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-6 text-sm font-semibold text-white shadow-[0_14px_40px_-16px_rgba(225,29,72,0.9)] transition-transform hover:-translate-y-0.5"
          >
            Создать фото
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}
