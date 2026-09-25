"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

const AUTOPLAY_MS = 4500;

const SLIDES = [
  {
    src: "/assets/img/banner_1.jpeg",
    alt: "Рекламный кадр: девушка в переливающемся розовом платье в неоновом клубе",
    tag: "Live Action",
    caption: "Живая съёмка",
  },
  {
    src: "/assets/img/banner_2.jpeg",
    alt: "Рекламный кадр: три девушки в школьной форме у окна класса",
    tag: "Студенческая",
    caption: "Университет",
  },
  {
    src: "/assets/img/banner_3.jpeg",
    alt: "Рекламный кадр: три девушки в вечерних платьях на фоне ночного города",
    tag: "Evening",
    caption: "Вечерний образ",
  },
];

export function BannerSlider() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const goTo = useCallback((next: number) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (paused || reduced) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % SLIDES.length),
      AUTOPLAY_MS,
    );
    return () => window.clearInterval(id);
  }, [paused, reduced]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      prev();
    }
  };

  const active = SLIDES[index];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Примеры стилей"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKeyDown}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(delta) > 48) {
          if (delta < 0) next();
          else prev();
        }
        touchStartX.current = null;
      }}
      tabIndex={0}
      className="group relative overflow-hidden rounded-card border border-line bg-panel shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]"
    >
      <div className="relative aspect-[16/10] sm:aspect-[2.1/1]">
        {SLIDES.map((slide, i) => (
          <div
            key={slide.src}
            aria-hidden={i !== index}
            className={[
              "absolute inset-0 transition-opacity duration-700 ease-out",
              i === index ? "opacity-100" : "opacity-0",
            ].join(" ")}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              priority={i === 0}
              sizes="(max-width: 768px) 100vw, 1152px"
              className="object-cover"
            />
          </div>
        ))}

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(10,9,11,0.9),transparent_58%)]"
        />

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-7">
          <div>
            <span className="inline-flex items-center rounded-full border border-brand/40 bg-brand-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink">
              {active.tag}
            </span>
            <p className="mt-2 font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
              {active.caption}
            </p>
          </div>

          <div className="flex gap-1.5" role="tablist" aria-label="Выбор слайда">
            {SLIDES.map((slide, i) => (
              <button
                key={slide.src}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Слайд ${i + 1} из ${SLIDES.length}`}
                onClick={() => goTo(i)}
                className={[
                  "h-1.5 rounded-full transition-all duration-300",
                  i === index
                    ? "w-7 bg-brand"
                    : "w-1.5 bg-white/40 hover:bg-white/70",
                ].join(" ")}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={prev}
          aria-label="Предыдущий слайд"
          className="absolute left-3 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-canvas/60 text-ink opacity-0 backdrop-blur-md transition-opacity hover:bg-canvas/80 focus-visible:opacity-100 group-hover:opacity-100 sm:grid"
        >
          <ChevronLeftIcon className="size-5" />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Следующий слайд"
          className="absolute right-3 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-canvas/60 text-ink opacity-0 backdrop-blur-md transition-opacity hover:bg-canvas/80 focus-visible:opacity-100 group-hover:opacity-100 sm:grid"
        >
          <ChevronRightIcon className="size-5" />
        </button>
      </div>
    </section>
  );
}
