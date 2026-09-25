import Link from "next/link";
import { ArrowRightIcon, ShieldCheckIcon } from "../../components/icons";

export const metadata = {
  title: "FAQ — Раздеватор",
  description:
    "Ответы на частые вопросы: приватность, удаление фото, оплата, форматы и правила сервиса.",
};

const FAQ = [
  {
    q: "Мои фото где-то публикуются?",
    a: "Нет. Изображения видны только вам в личном кабинете и не попадают в общую галерею.",
  },
  {
    q: "Как быстро удаляются загруженные фото?",
    a: "Оригиналы удаляются автоматически в течение 24 часов. Результат хранится до тех пор, пока вы не удалите его сами.",
  },
  {
    q: "Можно ли использовать фото других людей?",
    a: "Нет. Загружая фото, вы подтверждаете, что это ваше изображение или у вас есть согласие человека на обработку.",
  },
  {
    q: "Что если результат не понравился?",
    a: "Генерацию можно повторить с другим стилем. Если результат оказался неудачным, лимит не расходуется.",
  },
  {
    q: "Как оплатить и можно ли отменить подписку?",
    a: "Оплата картой, списание раз в месяц. Отменить или сменить тариф можно в любой момент в личном кабинете — без звонков и писем.",
  },
  {
    q: "Какие форматы и разрешение на выходе?",
    a: "Готовое изображение скачивается в JPG или PNG. На тарифе Премиум доступно максимальное разрешение до 4K.",
  },
  {
    q: "Нужна ли подписка, чтобы попробовать?",
    a: "Нет. После регистрации доступна пробная генерация, чтобы оценить результат до оплаты.",
  },
  {
    q: "Это реальные люди на изображениях?",
    a: "Нет. Сервис создаёт вымышленные изображения с помощью AI. Публикация и использование чужих фото без согласия запрещены.",
  },
];

export default function FaqPage() {
  return (
    <main className="flex-1 py-14 sm:py-20">
      <div className="container-page max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-xs font-medium text-muted">
          <ShieldCheckIcon className="size-4 text-brand" />
          Приватность и правила
        </span>

        <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          Частые вопросы
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
          Всё о приватности, оплате и качестве результата. Если ответа нет —
          напишите в поддержку.
        </p>

        <div className="mt-10 flex flex-col gap-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-tile border border-line bg-panel px-5 py-4 transition-colors hover:bg-panel-hover"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line-strong text-muted transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-panel border border-brand/40 bg-[linear-gradient(135deg,rgba(225,29,72,0.22),rgba(159,18,57,0.08))] p-7 sm:flex-row sm:items-center sm:p-8">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              Остались вопросы?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Напишите в поддержку или посмотрите тарифы.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="#support"
              className="inline-flex h-12 items-center justify-center rounded-full border border-line-strong px-6 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
            >
              Поддержка
            </a>
            <Link
              href="/pricing"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-6 text-sm font-semibold text-white shadow-[0_14px_40px_-16px_rgba(225,29,72,0.9)] transition-transform hover:-translate-y-0.5"
            >
              Тарифы
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
