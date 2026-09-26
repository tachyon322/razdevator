import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGeneration, setFavorite } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ message: "Требуется авторизация" }, { status: 401 });
  }

  const { id } = await params;
  const generation = getGeneration(id);
  if (!generation || generation.userId !== session.user.id) {
    return NextResponse.json({ message: "Генерация не найдена" }, { status: 404 });
  }

  let favorite: boolean;
  try {
    const body = (await request.json()) as { favorite?: boolean };
    favorite =
      typeof body.favorite === "boolean" ? body.favorite : !generation.favorite;
  } catch {
    favorite = !generation.favorite;
  }

  setFavorite(id, favorite);
  return NextResponse.json({ id, favorite });
}
