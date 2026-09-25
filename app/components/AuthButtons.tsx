"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function AuthButtons({
  variant = "desktop",
}: {
  variant?: "desktop" | "mobile";
}) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const signOut = async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };

  if (isPending) {
    return (
      <div
        aria-hidden
        className={[
          "animate-pulse rounded-full bg-panel-hover",
          variant === "mobile" ? "h-12 w-full" : "h-10 w-20",
        ].join(" ")}
      />
    );
  }

  if (session) {
    const label = session.user.name || session.user.email;
    return (
      <>
        <span
          className={[
            "truncate font-medium text-ink",
            variant === "mobile"
              ? "grid h-12 place-items-center rounded-full border border-line-strong px-4 text-sm"
              : "max-w-[140px] text-sm",
          ].join(" ")}
          title={label}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={signOut}
          className={[
            "font-medium text-muted transition-colors hover:text-ink",
            variant === "mobile"
              ? "grid h-12 place-items-center rounded-full border border-line-strong text-sm hover:bg-panel-hover"
              : "rounded-full px-4 py-2.5 text-sm",
          ].join(" ")}
        >
          Выйти
        </button>
      </>
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
