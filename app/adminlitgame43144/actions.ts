"use server";

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_TTL_SEC,
  adminPassword,
  checkAdminPassword,
  createAdminToken,
  loginBlockedFor,
  registerLoginFailure,
  resetLoginFailures,
} from "@/lib/admin-session";
import { isSettingKey, setSiteSetting } from "@/lib/settings";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/admin",
} as const;

export interface LoginState {
  error: string | null;
}

/** IP за прокси (Caddy кладёт его в X-Forwarded-For). */
async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!adminPassword()) notFound();

  const ip = await clientIp();
  const waitMs = loginBlockedFor(ip);
  if (waitMs > 0) {
    const minutes = Math.ceil(waitMs / 60_000);
    return { error: `Слишком много попыток. Попробуйте через ${minutes} мин.` };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || !checkAdminPassword(password)) {
    registerLoginFailure(ip);
    return { error: "Неверный пароль" };
  }

  resetLoginFailures(ip);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, createAdminToken(), {
    ...COOKIE_OPTIONS,
    maxAge: ADMIN_SESSION_TTL_SEC,
  });
  redirect("/admin");
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  redirect("/admin/login");
}

/** Переключатель витрины. Форма шлёт `key` и новое значение `value` ("1"/"0"). */
export async function updateSetting(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = formData.get("key");
  if (!isSettingKey(key)) return;
  setSiteSetting(key, formData.get("value") === "1");
  revalidatePath("/pricing");
  revalidatePath("/admin");
}
