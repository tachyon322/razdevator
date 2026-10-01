"use client";

import { useActionState } from "react";
import { login, type LoginState } from "../actions";

const INITIAL: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, INITIAL);

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-3">
      <input
        type="password"
        name="password"
        required
        autoFocus
        autoComplete="current-password"
        aria-label="Пароль"
        placeholder="Пароль"
        className="h-11 rounded-tile border border-line bg-elevated px-3 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Проверяем…" : "Войти"}
      </button>
      {state.error && (
        <p role="alert" className="text-xs leading-5 text-brand">
          {state.error}
        </p>
      )}
    </form>
  );
}
