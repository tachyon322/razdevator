import { BannerSlider } from "../components/BannerSlider";
import {
  ArrowRightIcon,
  BoltIcon,
  ImageIcon,
  InfinityIcon,
  LockIcon,
  ShieldCheckIcon,
  UploadIcon,
} from "../components/icons";

const STEPS = [
  {
    icon: UploadIcon,
    title: "Загрузите фото",
    text: "Одно чёткое фото анфас. Оно остаётся приватным и доступно только вам.",
  },
  {
    icon: ImageIcon,
    title: "Выберите стиль",
    text: "Локация, образ, свет и ракурс — более 20 готовых пресетов на выбор.",
  },
  {
    icon: BoltIcon,
    title: "Скачайте результат",
    text: "Готовый кадр примерно за 30 секунд. Оригиналы удаляются автоматически.",
  },
];

const PRIVACY = [
  "Загруженные оригиналы удаляются в течение 24 часов",
  "Результаты видны только в вашем личном кабинете",
  "Данные передаются и хранятся в зашифрованном виде",
  "Аккаунт и все материалы можно удалить одной кнопкой",
];

const TRUST = [
  { icon: LockIcon, label: "Фото не публикуются" },
  { icon: BoltIcon, label: "Готово за ~30 секунд" },
  { icon: InfinityIcon, label: "Более 20 стилей" },
];

export default function Home() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[-30%] h-[70%] bg-[radial-gradient(55%_60%_at_50%_50%,rgba(225,29,72,0.18),transparent_70%)]"
        />
        <div className="container-page relative pb-14 pt-14 sm:pt-20">
          <div className="max-w-2xl">

            <h1 className="mt-6 font-display text-[34px] font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Преврати обычное фото в 18+ кадр
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Загрузите своё фото, выберите образ — AI сделает всё остальное. Без
              публикации, без лишних глаз и следов.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#create"
                className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-7 text-[15px] font-semibold text-white shadow-[0_16px_44px_-16px_rgba(225,29,72,0.9)] transition-transform hover:-translate-y-0.5"
              >
                <UploadIcon className="size-5" />
                Загрузить фото
              </a>
              <a
                href="#styles"
                className="inline-flex h-13 items-center justify-center gap-2 rounded-full border border-line-strong px-7 text-[15px] font-semibold text-ink transition-colors hover:bg-panel-hover"
              >
                <ImageIcon className="size-5" />
                Смотреть примеры
              </a>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
              {TRUST.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-2 text-sm text-muted"
                >
                  <Icon className="size-4 text-brand" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div id="styles" className="mt-12 scroll-mt-24">
            <BannerSlider />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 py-16 sm:py-24">
        <div className="container-page">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Как это работает
          </h2>
          <p className="mt-3 max-w-xl text-muted">
            Три шага от обычного снимка до готового кадра.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div
                key={title}
                className="rounded-card border border-line bg-panel p-6 transition-colors hover:bg-panel-hover"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-tile bg-brand-soft text-brand">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-display text-lg font-bold text-faint">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section
        id="privacy"
        className="scroll-mt-24 border-y border-line bg-elevated/60 py-16 sm:py-24"
      >
        <div className="container-page">
          <div className="grid items-center gap-10 rounded-panel border border-line bg-panel p-7 sm:p-10 lg:grid-cols-2">
            <div>
              <span className="grid size-12 place-items-center rounded-tile bg-brand-soft text-brand">
                <LockIcon className="size-6" />
              </span>
              <h2 className="mt-5 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                Приватность по умолчанию
              </h2>
              <p className="mt-3 text-muted">
                Мы не показываем ваши фото никому и не используем их для обучения
                моделей.
              </p>
            </div>

            <ul className="grid gap-4">
              {PRIVACY.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-ink">
                  <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-brand" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 sm:py-24">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-panel border border-brand/40 bg-[linear-gradient(135deg,rgba(225,29,72,0.22),rgba(159,18,57,0.08))] p-8 text-center sm:p-14">
            <h2 className="mx-auto max-w-xl font-display text-2xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Готовы увидеть себя в новом образе?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted">
              Первая генерация — за несколько секунд. Приватно и без обязательств.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="#create"
                className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-8 text-[15px] font-semibold text-white shadow-[0_16px_44px_-16px_rgba(225,29,72,0.9)] transition-transform hover:-translate-y-0.5"
              >
                Создать фото
                <ArrowRightIcon className="size-5" />
              </a>
              <a
                href="/pricing"
                className="inline-flex h-13 items-center justify-center rounded-full border border-line-strong px-8 text-[15px] font-semibold text-ink transition-colors hover:bg-panel-hover"
              >
                Посмотреть тарифы
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
