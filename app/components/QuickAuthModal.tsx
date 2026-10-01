"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { QuickAuthButton, type QuickCredentials } from "./QuickAuthButton";
import { QuickCredentialsCard } from "./QuickCredentialsCard";
import { CloseIcon, LockIcon } from "./icons";

/** Флаг «предложение уже показано» — живёт в рамках вкладки, чтобы не навязываться. */
const DISMISS_KEY = "razdevator.quickAuthPrompt";
const DISMISS_EVENT = "razdevator:quickauth";

function isAuthPath(pathname: string): boolean {
  // На странице оплаты внешнего проекта окно быстрого входа не показываем:
  // покупатель пришёл из другого сервиса, регистрация здесь ему не нужна.
  // В админке вход свой — по паролю.
  return (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/pay/") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/gateway/")
  );
}

function subscribeDismissed(callback: () => void) {
  window.addEventListener(DISMISS_EVENT, callback);
  return () => window.removeEventListener(DISMISS_EVENT, callback);
}

function getDismissedSnapshot(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) !== null;
  } catch {
    return false;
  }
}

// На сервере считаем, что предложение уже показано: модалка не попадает в HTML
// и появляется только после гидратации, если гость ещё не авторизован.
function getDismissedServerSnapshot(): boolean {
  return true;
}

/**
 * Модалка для неавторизованных: предлагает создать аккаунт в 1 клик.
 * Показывается один раз за сессию вкладки, кроме страниц входа и регистрации.
 */
export function QuickAuthModal() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending, refetch } = authClient.useSession();
  const [credentials, setCredentials] = useState<QuickCredentials | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const dismissed = useSyncExternalStore(
    subscribeDismissed,
    getDismissedSnapshot,
    getDismissedServerSnapshot,
  );

  const offerable =
    !dismissed && !isPending && !session && !isAuthPath(pathname);
  // После быстрой регистрации сессия уже есть, но окно держим открытым,
  // чтобы пользователь успел сохранить сгенерированные логин и пароль.
  const open = credentials !== null || offerable;

  const dismiss = useCallback(() => {
    // Пока не сохранили логин и пароль, закрывать нельзя.
    if (credentials) return;
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // приватный режим: закрываем только на текущий рендер
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }, [credentials]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, dismiss]);

  // Закрываем без опоры на refetch: флаг показа надёжно гасит предложение,
  // даже если обновление сессии задержится.
  const proceed = async () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // приватный режим
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
    await refetch();
    router.refresh();
    setCredentials(null);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Регистрация в 1 клик"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas/95 p-4 backdrop-blur-xl"
    >
      <button
        type="button"
        aria-label="Закрыть"
        onClick={dismiss}
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
      />

      {credentials ? (
        <div className="relative w-full max-w-md">
          <QuickCredentialsCard credentials={credentials} onProceed={proceed} />
        </div>
      ) : (
        <div className="relative w-full max-w-md rounded-panel border border-line bg-panel p-7 text-center shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] sm:p-9">
          <button
            ref={closeRef}
            type="button"
            onClick={dismiss}
            aria-label="Закрыть"
            className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-panel-hover hover:text-ink"
          >
            <CloseIcon className="size-4" />
          </button>

          <span className="mx-auto grid size-12 place-items-center rounded-tile bg-brand-soft text-brand">
            <LockIcon className="size-6" />
          </span>

          <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">
            Регистрация в 1 клик
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Создайте аккаунт за пару секунд — без почты и пароля. Логин и пароль
            сгенерируем сами, а данные покажем после создания.
          </p>

          <div className="mt-6 text-left">
            <QuickAuthButton
              label="Создать аккаунт в 1 клик"
              onSuccess={setCredentials}
            />
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="mt-3 w-full rounded-full px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            Позже
          </button>

          <p className="mt-2 text-sm text-muted">
            Уже есть аккаунт?{" "}
            <Link
              href="/login"
              className="font-medium text-ink underline underline-offset-2 hover:text-brand"
            >
              Войти
            </Link>
          </p>

          <p className="mt-4 text-xs leading-5 text-faint">
            Сервис только для лиц 18+. Создавая аккаунт, вы подтверждаете свой
            возраст и принимаете{" "}
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
        </div>
      )}
    </div>
  );
}
