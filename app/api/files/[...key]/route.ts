import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getObject,
  headObject,
  isOwnedBy,
  type ObjectRange,
} from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Медиа неизменяемо: ключи — UUID, объекты не перезаписываются. Поэтому
 * отдаём агрессивный приватный кеш и поддержку `304 Not Modified`.
 */
const CACHE_CONTROL = "private, max-age=31536000, immutable";

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

/** Убирает `W/` и кавычки, чтобы сравнить ETag-и. */
function normalizeEtag(value: string): string {
  return value.trim().replace(/^W\//, "").replace(/"/g, "");
}

/** `If-None-Match`: совпадает ли список тегов (или `*`) с текущим ETag. */
function ifNoneMatchMatches(header: string, etag?: string): boolean {
  if (!etag) return false;
  if (header.trim() === "*") return true;
  const target = normalizeEtag(etag);
  return header.split(",").some((raw) => normalizeEtag(raw) === target);
}

/** `If-Modified-Since`: объект не менялся после указанной даты. */
function ifModifiedSinceMatches(header: string, lastModified?: Date): boolean {
  if (!lastModified) return false;
  const since = Date.parse(header);
  if (!Number.isFinite(since)) return false;
  // HTTP-даты имеют секундную точность.
  const modified = Math.floor(lastModified.getTime() / 1000) * 1000;
  return modified <= since;
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
  const ifNoneMatch = request.headers.get("if-none-match");
  const ifModifiedSince = request.headers.get("if-modified-since");

  // Условный запрос: проверяем метаданные, тело не качаем.
  if (ifNoneMatch || ifModifiedSince) {
    try {
      const meta = await headObject(key);
      if (!meta) {
        return NextResponse.json({ message: "Файл не найден" }, { status: 404 });
      }
      const notModified = ifNoneMatch
        ? ifNoneMatchMatches(ifNoneMatch, meta.etag)
        : ifModifiedSinceMatches(ifModifiedSince ?? "", meta.lastModified);
      if (notModified) {
        const notModifiedHeaders = new Headers({
          "Cache-Control": CACHE_CONTROL,
          "Accept-Ranges": "bytes",
          "X-Content-Type-Options": "nosniff",
        });
        if (meta.etag) notModifiedHeaders.set("ETag", meta.etag);
        if (meta.lastModified) {
          notModifiedHeaders.set("Last-Modified", meta.lastModified.toUTCString());
        }
        return new Response(null, { status: 304, headers: notModifiedHeaders });
      }
    } catch (error) {
      // Сбой HEAD не должен ломать выдачу — просто отдаём файл как обычно.
      console.error("[files] ошибка HEAD:", error);
    }
  }

  try {
    const object = await getObject(key, range ?? undefined);
    const responseHeaders = new Headers({
      "Content-Type": object.contentType,
      "Cache-Control": CACHE_CONTROL,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    if (object.contentLength !== undefined) {
      responseHeaders.set("Content-Length", String(object.contentLength));
    }
    if (object.etag) {
      responseHeaders.set("ETag", object.etag);
    }
    if (object.lastModified) {
      responseHeaders.set("Last-Modified", object.lastModified.toUTCString());
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
