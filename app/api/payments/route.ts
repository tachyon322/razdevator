import { isIP } from "node:net";
import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import {
  attachProviderPayment,
  countOpenPayments,
  createPayment,
  setPaymentStatus,
} from "@/lib/db";
import { createInvoice } from "@/lib/exenta";
import { getSiteSettings } from "@/lib/settings";
import {
  PACK_MODE_TOPUP_RANGE,
  TOPUP_RANGE,
  findPack,
  formatPrice,
  isValidTopUp,
  packCreditRub,
} from "@/lib/plans";

export const runtime = "nodejs";

/** Сколько неоплаченных счетов можно держать одновременно (срок жизни — 15 мин). */
const MAX_OPEN_PAYMENTS = 5;
const OPEN_WINDOW_MS = 15 * 60 * 1000;

const DESCRIPTION = "Пополнение баланса neuromatic";

/** IP покупателя за прокси (Caddy кладёт его в X-Forwarded-For). */
function buyerIp(requestHeaders: Headers): string | null {
  const candidate =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip")?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}

function siteUrl(request: NextRequest): string {
  return (process.env.BETTER_AUTH_URL || request.nextUrl.origin).replace(
    /\/+$/,
    "",
  );
}

/**
 * Создаёт счёт и возвращает ссылку на оплату. Тело: `{ amount }` — пополнение
 * на сумму, или `{ packId }` — покупка пакета из /pricing.
 */
export async function POST(request: NextRequest) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) {
    return NextResponse.json({ message: "Требуется авторизация" }, { status: 401 });
  }

  let body: { amount?: unknown; packId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "Некорректный запрос" }, { status: 400 });
  }

  // Пакет: платим цену пакета, на баланс зачисляем его номинал.
  // Обычное пополнение: платим и зачисляем одну и ту же сумму.
  let amount: number;
  let creditRub: number;
  let packId: string | null = null;
  if (body.packId !== undefined) {
    const pack = findPack(body.packId);
    if (!pack) {
      return NextResponse.json({ message: "Пакет не найден" }, { status: 400 });
    }
    amount = pack.price;
    creditRub = packCreditRub(pack);
    packId = pack.id;
  } else {
    // Галочка в админке «блокировать на сервере»: своя сумма — только в
    // узком диапазоне режима «пакеты».
    const range = getSiteSettings().blockCustomTopUp
      ? PACK_MODE_TOPUP_RANGE
      : TOPUP_RANGE;
    amount = Number(body.amount);
    creditRub = amount;
    if (!isValidTopUp(amount, range)) {
      return NextResponse.json(
        {
          message: `Сумма пополнения — от ${formatPrice(range.min)} до ${formatPrice(range.max)}`,
        },
        { status: 400 },
      );
    }
  }

  const userId = session.user.id;
  const since = new Date(Date.now() - OPEN_WINDOW_MS).toISOString();
  if (countOpenPayments(userId, since) >= MAX_OPEN_PAYMENTS) {
    return NextResponse.json(
      {
        message:
          "Слишком много неоплаченных счетов. Оплатите созданный или попробуйте через 15 минут.",
      },
      { status: 429 },
    );
  }

  const payment = createPayment({ userId, amountRub: amount, creditRub, packId });
  // Тот же адрес возврата, что и у счетов внешних проектов: один гейт на всех.
  const returnUrl = `${siteUrl(request)}/pay/${payment.id}`;

  try {
    const invoice = await createInvoice({
      amountRub: amount,
      description: DESCRIPTION,
      buyerIp: buyerIp(requestHeaders),
      successUrl: returnUrl,
      failedUrl: returnUrl,
    });
    // Успех проводится только через сверку (creditPayment), не при создании.
    attachProviderPayment(
      payment.id,
      invoice.uuid,
      invoice.status === "SUCCESS" ? "PENDING" : invoice.status,
    );
    return NextResponse.json({ id: payment.id, redirectUrl: invoice.redirectUrl });
  } catch (error) {
    console.error("[payments] не удалось создать счёт:", error);
    setPaymentStatus(payment.id, "FAILED");
    return NextResponse.json(
      { message: "Платёжный сервис временно недоступен. Попробуйте позже." },
      { status: 502 },
    );
  }
}
