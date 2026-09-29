import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CODE_RE = /^[A-Za-z0-9]{1,32}$/;
const MAX_AGE = 90 * 24 * 60 * 60;

/**
 * Партнёрская ссылка /r/{код}: отправляет на трекер Cashx (он считает клик,
 * подписывает click_token и возвращает на сайт). Код запоминаем в cookie на
 * случай, если Cashx вернёт без параметров.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const base = (
    process.env.CASHX_REDIRECT_BASE ??
    process.env.CASHX_BASE_URL ??
    ""
  ).replace(/\/$/, "");

  if (!base || !CODE_RE.test(code)) {
    // Относительный Location: за прокси request.url указывает на внутренний адрес.
    return new Response(null, { status: 302, headers: { Location: "/" } });
  }

  const response = NextResponse.redirect(
    `${base}/c/${code.toUpperCase()}`,
    302,
  );
  response.cookies.set("aff_ref", code.toUpperCase(), {
    path: "/",
    maxAge: MAX_AGE,
    sameSite: "lax",
  });
  return response;
}
