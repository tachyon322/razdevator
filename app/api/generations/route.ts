import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listGenerations, type GenerationKind } from "@/lib/db";
import { toGenerationDTO } from "@/lib/generation-dto";

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
  const limitRaw = Number(searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 100;

  const generations = listGenerations(session.user.id, { kind, favorite, limit });
  return NextResponse.json({
    generations: generations.map(toGenerationDTO),
  });
}
