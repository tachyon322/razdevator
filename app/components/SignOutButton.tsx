"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    if (pending) return;
    setPending(true);
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong px-6 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover disabled:opacity-60"
    >
      {pending ? "Выходим…" : "Выйти"}
    </button>
  );
}
