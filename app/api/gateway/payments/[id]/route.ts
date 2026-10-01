import { NextResponse, type NextRequest } from "next/server";
import { getGatewayPayment } from "@/lib/db";
import { getGatewayProject, verifyGatewayRequest } from "@/lib/gateway";
import { reconcileGatewayPayment } from "@/lib/gateway-payments";

export const runtime = "nodejs";

/** Текущий статус счёта: при незавершённом — доcпрашиваем провайдера. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const project = getGatewayProject(request.headers.get("x-gateway-project") ?? "");
  if (!project || !verifyGatewayRequest(project, request.headers, "")) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Неверная подпись запроса" } },
      { status: 401 },
    );
  }

  const { id } = await params;
  let payment = getGatewayPayment(id);
  if (!payment || payment.projectId !== project.id) {
    return NextResponse.json(
      { error: { code: "PAYMENT_NOT_FOUND", message: "Платёж не найден" } },
      { status: 404 },
    );
  }

  try {
    payment = await reconcileGatewayPayment(payment);
  } catch (error) {
    // Отдаём последний известный статус: проект опросит ещё раз.
    console.warn(`[gateway] сверка счёта ${payment.id} не удалась:`, error);
  }

  return NextResponse.json({
    id: payment.id,
    externalId: payment.externalId,
    amountRub: payment.amountRub,
    status: payment.status,
    paidAt: payment.paidAt,
  });
}
