"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function AuthButtons({
  variant = "desktop",
}: {
  variant?: "desktop" | "mobile";
}) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div
        aria-hidden
        className={[
          "animate-pulse rounded-full bg-panel-hover",
          variant === "mobile" ? "h-12 w-full" : "h-10 w-24",
        ].join(" ")}
      />
    );
  }

  if (session) {
    const label = session.user.name || session.user.email;
    const initial = label.trim().charAt(0).toUpperCase();

    return (
      <Link
        href="/profile"
        title={label}
        className={[
          "flex items-center gap-2.5 font-medium text-ink transition-colors hover:text-brand",
          variant === "mobile"
            ? "h-12 rounded-full border border-line-strong px-3 text-sm hover:bg-panel-hover"
            : "rounded-full border border-transparent py-1.5 pl-1.5 pr-3 text-sm hover:border-line",
        ].join(" ")}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] text-xs font-semibold text-white">
          {initial}
        </span>
        <span className="max-w-[160px] truncate">{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className={[
        "font-medium text-muted transition-colors hover:text-ink",
        variant === "mobile"
          ? "grid h-12 place-items-center rounded-full border border-line-strong text-sm hover:bg-panel-hover"
          : "rounded-full px-4 py-2.5 text-sm",
      ].join(" ")}
    >
      Войти
    </Link>
  );
}
