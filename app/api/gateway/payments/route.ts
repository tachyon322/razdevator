import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import {
  attachGatewayProvider,
  countOpenGatewayPayments,
  createGatewayPayment,
  getGatewayPaymentByExternalId,
  setGatewayPaymentStatus,
} from "@/lib/db";
import { ExentaError, createInvoice } from "@/lib/exenta";
import {
  allowedReturnOrigin,
  getGatewayProject,
  verifyGatewayRequest,
} from "@/lib/gateway";
import { applyGatewayProviderStatus } from "@/lib/gateway-payments";
import { MAX_TOPUP, MIN_TOPUP, isValidTopUp } from "@/lib/plans";

export const runtime = "nodejs";

/** Сколько незавершённых счетов проект может держать одновременно (15 мин). */
const MAX_OPEN_PAYMENTS = 20;
const OPEN_WINDOW_MS = 15 * 60 * 1000;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function siteUrl(request: NextRequest): string {
  return (process.env.BETTER_AUTH_URL || request.nextUrl.origin).replace(/\/+$/, "");
}

/** IP покупателя: его передаёт проект, иначе берём из запроса. */
function buyerIp(request: NextRequest, fromProject: unknown): string | null {
  const candidate =
    (typeof fromProject === "string" ? fromProject.trim() : "") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "";
  return candidate && isIP(candidate) ? candidate : null;
}

function shortString(value: unknown, max = 64): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

/**
 * Создаёт счёт по заказу внешнего проекта и возвращает ссылку на оплату.
 * Повтор с тем же externalId отдаёт уже созданный счёт (идемпотентность).
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const project = getGatewayProject(request.headers.get("x-gateway-project") ?? "");
  if (!project || !verifyGatewayRequest(project, request.headers, rawBody)) {
    return errorResponse(401, "UNAUTHORIZED", "Неверная подпись запроса");
  }

  let body: {
    externalId?: unknown;
    externalUserId?: unknown;
    purpose?: unknown;
    method?: unknown;
    amountRub?: unknown;
    buyerIp?: unknown;
    returnUrl?: unknown;
  };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "Некорректный JSON");
  }

  const externalId = shortString(body.externalId);
  if (!externalId) {
    return errorResponse(400, "INVALID_REQUEST", "externalId обязателен");
  }

  const amountRub = Number(body.amountRub);
  if (!isValidTopUp(amountRub)) {
    return errorResponse(
      400,
      "INVALID_AMOUNT",
      `Сумма — целое число от ${MIN_TOPUP} до ${MAX_TOPUP} ₽`,
    );
  }

  const existing = getGatewayPaymentByExternalId(project.id, externalId);
  if (existing) {
    return NextResponse.json({
      id: existing.id,
      paymentUrl: existing.redirectUrl,
      status: existing.status,
    });
  }

  const since = new Date(Date.now() - OPEN_WINDOW_MS).toISOString();
  if (countOpenGatewayPayments(project.id, since) >= MAX_OPEN_PAYMENTS) {
    return errorResponse(
      429,
      "TOO_MANY_OPEN",
      "Слишком много незавершённых счетов. Оплатите созданный или попробуйте через 15 минут.",
    );
  }

  const payment = createGatewayPayment({
    projectId: project.id,
    externalId,
    externalUserId: shortString(body.externalUserId),
    purpose: shortString(body.purpose, 32),
    method: shortString(body.method, 32),
    amountRub,
    returnUrl: allowedReturnOrigin(
      project,
      typeof body.returnUrl === "string" ? body.returnUrl : null,
    ),
    buyerIp: buyerIp(request, body.buyerIp),
  });

  // В счёте Exenta фигурирует только наш домен; адрес нейтральный, без токена —
  // страница всё равно ничего не показывает.
  const returnPageUrl = `${siteUrl(request)}/pay/${payment.id}`;

  try {
    const invoice = await createInvoice({
      amountRub,
      description: project.description,
      buyerIp: payment.buyerIp,
      successUrl: returnPageUrl,
      failedUrl: returnPageUrl,
    });
    // Успех проводит только сверка (applyGatewayProviderStatus), но счёт,
    // который провайдер сразу отклонил, проект узнаёт колбэком отсюда.
    const attached = attachGatewayProvider(
      payment.id,
      invoice.uuid,
      invoice.redirectUrl,
    );
    const fresh = applyGatewayProviderStatus(attached, invoice);
    console.info(
      `[gateway] счёт ${fresh.id} проекта ${project.id} на ${amountRub} ₽: ${fresh.status}`,
    );
    return NextResponse.json({
      id: fresh.id,
      paymentUrl: fresh.redirectUrl,
      status: fresh.status,
    });
  } catch (error) {
    console.error(`[gateway] не удалось создать счёт ${payment.id}:`, error);
    setGatewayPaymentStatus(payment.id, "FAILED");
    return errorResponse(
      502,
      "PROVIDER_UNAVAILABLE",
      error instanceof ExentaError
        ? "Платёжный сервис временно недоступен. Попробуйте позже."
        : "Не удалось создать счёт. Попробуйте позже.",
    );
  }
}
