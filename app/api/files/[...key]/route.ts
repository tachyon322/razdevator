import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getObject, isOwnedBy, type ObjectRange } from "@/lib/storage";

export const runtime = "nodejs";

/** Разбирает заголовок Range вида `bytes=start-end`. */
function parseRange(value: string | null): ObjectRange | null {
  if (!value) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]);
  if (!Number.isFinite(start)) return null;
  const end = match[2] ? Number(match[2]) : undefined;
  if (end !== undefined && (!Number.isFinite(end) || end < start)) return null;
  return { start, end };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ message: "Требуется авторизация" }, { status: 401 });
  }

  const { key: parts } = await params;
  const key = parts.map((part) => decodeURIComponent(part)).join("/");

  if (!isOwnedBy(key, session.user.id)) {
    return NextResponse.json({ message: "Нет доступа к файлу" }, { status: 403 });
  }

  const range = parseRange(request.headers.get("range"));

  try {
    const object = await getObject(key, range ?? undefined);
    const responseHeaders = new Headers({
      "Content-Type": object.contentType,
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    });
    if (object.contentLength !== undefined) {
      responseHeaders.set("Content-Length", String(object.contentLength));
    }
    if (range) {
      if (object.contentRange) {
        responseHeaders.set("Content-Range", object.contentRange);
      }
      return new Response(object.body, {
        status: object.statusCode === 206 ? 206 : 200,
        headers: responseHeaders,
      });
    }
    return new Response(object.body, { headers: responseHeaders });
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound") {
      return NextResponse.json({ message: "Файл не найден" }, { status: 404 });
    }
    console.error("[files] ошибка чтения:", error);
    return NextResponse.json(
      { message: "Не удалось прочитать файл" },
      { status: 502 },
    );
  }
}
