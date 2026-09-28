"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CameraIcon } from "./icons";

const STORAGE_KEY = "razdevator.ageVerified";
const CHANGE_EVENT = "razdevator:agegate";
/** Куда уводим пользователя, который младше 18. */
const EXIT_URL = "https://www.google.com";

/**
 * Ставит атрибут на <html> до первой отрисовки, чтобы ворота не мигали тем,
 * кто уже подтвердил возраст. Вставляется первым элементом <body>.
 */
export const AGE_GATE_INIT_SCRIPT = `(function(){try{if(localStorage.getItem('${STORAGE_KEY}')==='1'){document.documentElement.setAttribute('data-age-verified','1')}}catch(e){}})();`;

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

// На сервере и при гидратации считаем, что возраст не подтверждён: ворота
// показываем всегда, а подтвердившим их прячет CSS по атрибуту.
function getServerSnapshot(): boolean {
  return false;
}

export function AgeGate() {
  const verified = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [denied, setDenied] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const open = !verified;

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!verified) confirmRef.current?.focus();
  }, [verified]);

  if (!open) return null;

  const confirm = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // приватный режим: пропускаем только на текущую сессию
    }
    document.documentElement.setAttribute("data-age-verified", "1");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <div
      data-age-gate
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas/95 p-4 backdrop-blur-xl"
    >
      <div className="w-full max-w-md rounded-panel border border-line bg-panel p-8 text-center shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
        <span className="mx-auto grid size-12 place-items-center rounded-tile bg-[linear-gradient(135deg,#e11d48,#9f1239)] shadow-[0_8px_28px_-10px_rgba(225,29,72,0.75)]">
          <CameraIcon className="size-6 text-white" />
        </span>
        <p className="mt-4 font-display text-sm font-semibold tracking-tight text-ink">
          Раздеватор
        </p>

        {denied ? (
          <>
            <h2
              id="age-gate-title"
              className="mt-4 font-display text-2xl font-bold text-ink"
            >
              Доступ закрыт
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Сайт содержит материалы для взрослых и доступен только
              пользователям 18 лет и старше.
            </p>
            <a
              href={EXIT_URL}
              className="mt-6 grid h-12 place-items-center rounded-full border border-line-strong text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
            >
              Покинуть сайт
            </a>
          </>
        ) : (
          <>
            <h2
              id="age-gate-title"
              className="mt-4 font-display text-2xl font-bold text-ink"
            >
              Вам есть 18 лет?
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              На сайте содержатся материалы для взрослых. Подтвердите, что вам
              исполнилось 18 лет, чтобы продолжить.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                ref={confirmRef}
                type="button"
                onClick={confirm}
                className="grid h-12 place-items-center rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] text-sm font-semibold text-white shadow-[0_10px_34px_-12px_rgba(225,29,72,0.8)] transition-transform hover:-translate-y-0.5"
              >
                Да, мне 18
              </button>
              <button
                type="button"
                onClick={() => setDenied(true)}
                className="grid h-12 place-items-center rounded-full border border-line-strong text-sm font-semibold text-muted transition-colors hover:bg-panel-hover hover:text-ink"
              >
                Нет, мне меньше 18
              </button>
            </div>
            <p className="mt-4 text-xs leading-5 text-faint">
              Подтверждая возраст, вы принимаете{" "}
              <Link
                href="/terms"
                className="text-muted underline underline-offset-2 hover:text-ink"
              >
                условия
              </Link>{" "}
              и{" "}
              <Link
                href="/privacy"
                className="text-muted underline underline-offset-2 hover:text-ink"
              >
                политику конфиденциальности
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
