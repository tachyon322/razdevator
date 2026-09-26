import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listGenerations, type GenerationKind } from "@/lib/db";
import { toGenerationSummaryDTO } from "@/lib/generation-dto";
import { decodeCursor, encodeCursor, GALLERY_PAGE_SIZE } from "@/lib/pagination";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ message: "Требуется авторизация" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const kindRaw = searchParams.get("kind");
  const kind: GenerationKind | undefined =
    kindRaw === "image" || kindRaw === "video" ? kindRaw : undefined;
  const favorite = searchParams.get("favorite") === "true";
  const limitRaw = Number(searchParams.get("limit") ?? GALLERY_PAGE_SIZE);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), 60)
    : GALLERY_PAGE_SIZE;
  const before = decodeCursor(searchParams.get("cursor")) ?? undefined;

  const generations = listGenerations(session.user.id, {
    kind,
    favorite,
    limit,
    before,
  });

  const last = generations[generations.length - 1];
  const nextCursor =
    generations.length === limit && last ? encodeCursor(last) : null;

  return NextResponse.json({
    generations: generations.map(toGenerationSummaryDTO),
    nextCursor,
  });
}
