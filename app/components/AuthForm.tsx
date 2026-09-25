"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { ArrowRightIcon, LockIcon } from "./icons";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const isRegister = mode === "register";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (isRegister && password.length < 8) {
      setError("Пароль должен быть не короче 8 символов");
      return;
    }

    setPending(true);
    const res = isRegister
      ? await authClient.signUp.email({ name, email, password })
      : await authClient.signIn.email({ email, password });
    setPending(false);

    if (res.error) {
      setError(res.error.message ?? "Что-то пошло не так. Попробуйте ещё раз.");
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="w-full max-w-md rounded-panel border border-line bg-panel p-7 shadow-[0_40px_120px_-50px_rgba(0,0,0,0.9)] sm:p-9">
      <span className="grid size-11 place-items-center rounded-tile bg-brand-soft text-brand">
        <LockIcon className="size-5" />
      </span>

      <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {isRegister ? "Создать аккаунт" : "Вход"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {isRegister
          ? "Регистрация занимает меньше минуты."
          : "Войдите, чтобы продолжить работу с фото."}
      </p>

      <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
        {isRegister && (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted">Имя</span>
            <input
              type="text"
              name="name"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как к вам обращаться"
              className="h-12 rounded-tile border border-line-strong bg-panel-hover px-4 text-[15px] text-ink placeholder:text-faint focus:border-brand"
            />
          </label>
        )}

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-12 rounded-tile border border-line-strong bg-panel-hover px-4 text-[15px] text-ink placeholder:text-faint focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">Пароль</span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? "Минимум 8 символов" : "Ваш пароль"}
            className="h-12 rounded-tile border border-line-strong bg-panel-hover px-4 text-[15px] text-ink placeholder:text-faint focus:border-brand"
          />
        </label>

        {error && (
          <p className="rounded-tile border border-brand/40 bg-brand-soft px-4 py-3 text-sm text-ink">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-6 text-[15px] font-semibold text-white shadow-[0_14px_40px_-16px_rgba(225,29,72,0.9)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {pending ? (
            "Подождите…"
          ) : (
            <>
              {isRegister ? "Зарегистрироваться" : "Войти"}
              <ArrowRightIcon className="size-5" />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {isRegister ? "Уже есть аккаунт? " : "Нет аккаунта? "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="font-medium text-ink underline underline-offset-2 hover:text-brand"
        >
          {isRegister ? "Войти" : "Зарегистрироваться"}
        </Link>
      </p>
    </div>
  );
}
