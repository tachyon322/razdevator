import { NextResponse, type NextRequest } from "next/server";
import { getGatewayPayment } from "@/lib/db";
import { getGatewayProject, verifyReturnToken } from "@/lib/gateway";
import { reconcileGatewayPayment } from "@/lib/gateway-payments";

export const runtime = "nodejs";

/**
 * Публичный статус для страницы возврата покупателя: доступ по токену из URL
 * (`?t=…`, HMAC секретом проекта), авторизация не нужна — покупатель шлюза не
 * имеет аккаунта neuromatic.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let payment = getGatewayPayment(id);
  const project = payment ? getGatewayProject(payment.projectId) : null;
  if (
    !payment ||
    !project ||
    !verifyReturnToken(project.secret, payment.id, request.nextUrl.searchParams.get("t"))
  ) {
    return NextResponse.json({ message: "Счёт не найден" }, { status: 404 });
  }

  try {
    payment = await reconcileGatewayPayment(payment);
  } catch (error) {
    console.warn(`[gateway] страница возврата ${payment.id}: сверка не удалась:`, error);
  }

  return NextResponse.json({
    status: payment.status,
    amountRub: payment.amountRub,
    returnUrl: payment.returnUrl,
  });
}
