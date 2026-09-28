import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getUserUsage } from "@/lib/db";
import { TRIAL } from "@/lib/plans";

export const runtime = "nodejs";

/**
 * Свежие баланс и лимит текущего пользователя. Нужен клиентским компонентам
 * (шапка, мобильное меню): сессия better-auth кешируется на 5 минут и после
 * списания отстаёт, поэтому данные читаем напрямую из БД.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ message: "Требуется авторизация" }, { status: 401 });
  }

  const usage = getUserUsage(session.user.id);
  const used = usage?.generationsUsed ?? 0;

  return NextResponse.json({
    balanceRub: usage?.balanceRub ?? 0,
    generationsUsed: used,
    trialLeft: Math.max(TRIAL.limit - used, 0),
  });
}
