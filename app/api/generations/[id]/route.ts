import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteGeneration, getGeneration } from "@/lib/db";
import { toGenerationDTO } from "@/lib/generation-dto";
import { deleteObject } from "@/lib/storage";

export const runtime = "nodejs";

async function resolveOwned(id: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return {
      error: NextResponse.json(
        { message: "Требуется авторизация" },
        { status: 401 },
      ),
    } as const;
  }
  const generation = getGeneration(id);
  if (!generation || generation.userId !== session.user.id) {
    return {
      error: NextResponse.json(
        { message: "Генерация не найдена" },
        { status: 404 },
      ),
    } as const;
  }
  return { generation } as const;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const resolved = await resolveOwned(id);
  if ("error" in resolved) return resolved.error;
  return NextResponse.json(toGenerationDTO(resolved.generation));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const resolved = await resolveOwned(id);
  if ("error" in resolved) return resolved.error;

  const keys = deleteGeneration(id);
  await Promise.all(
    keys.map((key) => deleteObject(key).catch(() => undefined)),
  );

  return NextResponse.json({ ok: true });
}
