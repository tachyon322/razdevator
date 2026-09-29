import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPayment } from "@/lib/db";
import { reconcilePayment } from "@/lib/payments";

export const runtime = "nodejs";

/**
 * Статус платежа для страницы возврата. Пока счёт не завершён, сверяемся с
 * провайдером — это запасной путь зачисления, если вебхук не дошёл.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ message: "Требуется авторизация" }, { status: 401 });
  }

  const { id } = await params;
  let payment = getPayment(id);
  if (!payment || payment.userId !== session.user.id) {
    return NextResponse.json({ message: "Платёж не найден" }, { status: 404 });
  }

  try {
    payment = await reconcilePayment(payment);
  } catch (error) {
    // Провайдер недоступен — отдаём последний известный статус, клиент спросит ещё раз.
    console.error(`[payments] сверка платежа ${id} не удалась:`, error);
  }

  return NextResponse.json({
    id: payment.id,
    amountRub: payment.amountRub,
    status: payment.status,
  });
}
