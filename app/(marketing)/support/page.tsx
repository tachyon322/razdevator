import Link from "next/link";
import {
  ArrowRightIcon,
  BoltIcon,
  LockIcon,
  MailIcon,
  ShieldCheckIcon,
  TelegramIcon,
  TrashIcon,
  WandIcon,
} from "@/app/components/icons";
import {
  SUPPORT_EMAIL,
  SUPPORT_RESPONSE_TIME,
  SUPPORT_TELEGRAM,
} from "@/lib/support";

export const metadata = {
  title: "Поддержка — Раздеватор",
  description:
    "Как связаться с поддержкой сервиса: почта и Telegram, что указать в обращении, удаление аккаунта и данных.",
};

const CHANNELS = [
  {
    icon: MailIcon,
    title: "Почта поддержки",
    value: SUPPORT_EMAIL,
    href: `mailto:${SUPPORT_EMAIL}`,
    hint: SUPPORT_RESPONSE_TIME,
    external: false,
  },
  ...(SUPPORT_TELEGRAM
    ? [
        {
          icon: TelegramIcon,
          title: "Telegram",
          value: `@${SUPPORT_TELEGRAM}`,
          href: `https://t.me/${SUPPORT_TELEGRAM}`,
          hint: SUPPORT_RESPONSE_TIME,
          external: true,
        },
      ]
    : []),
];

const TOPICS = [
  {
    icon: BoltIcon,
    title: "Оплата и пакеты",
    text: "Оплата фото и видео, покупка пакетов, возврат за неиспользованные генерации.",
  },
  {
    icon: WandIcon,
    title: "Генерации и списания",
    text: "Неудачный результат, ошибка обработки, списание денег за сбойную генерацию.",
  },
  {
    icon: LockIcon,
    title: "Доступ к аккаунту",
    text: "Не получается войти, забыли пароль, заметили подозрительную активность.",
  },
  {
    icon: TrashIcon,
    title: "Удаление данных",
    text: "Удаление аккаунта, фото и результатов. Аккаунт удаляется кнопкой в личном кабинете.",
  },
];

const CHECKLIST = [
  "Адрес электронной почты, на который зарегистрирован аккаунт.",
  "Краткое описание проблемы и когда она возникла.",
  "Скриншот экрана или идентификатор генерации, если вопрос про результат.",
  "Дату и сумму платежа — если вопрос про оплату или возврат.",
];

export default function SupportPage() {
  return (
    <main className="flex-1 py-14 sm:py-20">
      <div className="container-page max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-xs font-medium text-muted">
          <ShieldCheckIcon className="size-4 text-brand" />
          Поддержка
        </span>

        <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          Поддержка
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
          Пишите напрямую — без очередей и автоответчиков. Обращения принимаем
          по почте{SUPPORT_TELEGRAM ? " и в Telegram" : ""}: отвечает человек,
          который ведёт сервис.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {CHANNELS.map((channel) => (
            <a
              key={channel.title}
              href={channel.href}
              target={channel.external ? "_blank" : undefined}
              rel={channel.external ? "noreferrer" : undefined}
              className="group flex flex-col rounded-card border border-brand/40 bg-panel p-6 transition-colors hover:bg-panel-hover"
            >
              <span className="grid size-11 place-items-center rounded-tile bg-brand-soft text-brand">
                <channel.icon className="size-5" />
              </span>
              <span className="mt-4 text-xs uppercase tracking-wider text-faint">
                {channel.title}
              </span>
              <span className="mt-1 break-words font-mono text-base font-semibold text-ink">
                {channel.value}
              </span>
              <span className="mt-3 text-sm text-muted">{channel.hint}</span>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-ink">
                Написать
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </a>
          ))}
        </div>

        <h2 className="mt-12 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
          С чем помогаем
        </h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {TOPICS.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="rounded-card border border-line bg-panel p-5 transition-colors hover:bg-panel-hover"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-tile bg-brand-soft text-brand">
                  <Icon className="size-5" />
                </span>
                <h3 className="text-base font-semibold text-ink">{title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-panel border border-line bg-panel p-6 sm:p-7">
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">
            Что указать в обращении
          </h2>
          <ul className="mt-4 flex flex-col gap-2.5">
            {CHECKLIST.map((item) => (
              <li
                key={item}
                className="flex gap-3 text-sm leading-relaxed text-muted"
              >
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 rounded-tile border border-line-strong bg-panel-hover px-4 py-3 text-sm leading-relaxed text-muted">
            Мы никогда не просим пароль от аккаунта и данные банковской карты.
            Если такие данные запрашивают от имени поддержки — это мошенники.
          </p>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-panel border border-brand/40 bg-[linear-gradient(135deg,rgba(225,29,72,0.22),rgba(159,18,57,0.08))] p-7 sm:flex-row sm:items-center sm:p-8">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              Возможно, ответ уже есть
            </h2>
            <p className="mt-2 text-sm text-muted">
              Частые вопросы об оплате, приватности и удалении фото — в FAQ.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/faq"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-line-strong px-6 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
            >
              Частые вопросы
              <ArrowRightIcon className="size-4" />
            </Link>
            <Link
              href="/gallery"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-line-strong px-6 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
            >
              Галерея
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/privacy"
            className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
          >
            Политика конфиденциальности
          </Link>
          <Link
            href="/terms"
            className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
          >
            Пользовательское соглашение
          </Link>
        </div>
      </div>
    </main>
  );
}
