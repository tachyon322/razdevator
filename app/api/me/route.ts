import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getUserUsage } from "@/lib/db";
import { customTopUpVisible, getSiteSettings } from "@/lib/settings";

export const runtime = "nodejs";

/**
 * Свежие баланс и счётчик генераций текущего пользователя. Нужен клиентским
 * компонентам (шапка, мобильное меню): сессия better-auth кешируется на 5 минут
 * и после списания отстаёт, поэтому данные читаем напрямую из БД.
 * `customTopUp` — показывать ли в модалке пополнение на сумму (иначе только пакеты).
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ message: "Требуется авторизация" }, { status: 401 });
  }

  const usage = getUserUsage(session.user.id);

  return NextResponse.json({
    balanceRub: usage?.balanceRub ?? 0,
    generationsUsed: usage?.generationsUsed ?? 0,
    customTopUp: customTopUpVisible(getSiteSettings()),
  });
}
