import { NextResponse, type NextRequest } from "next/server";
import {
  MIN_CONFIDENCE,
  SYSTEM_PROMPT,
  USER_PROMPT,
  coerceAssessment,
  isSourceAllowed,
  minApparentAge,
  moderationModel,
} from "@/lib/moderation";
import { nanogptBaseUrl } from "@/lib/nanogpt";

export const runtime = "nodejs";

/** Стенд существует только локально: в проде оба метода отвечают 404. */
function inProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Значения по умолчанию — ровно те, что действуют в проде. */
export async function GET() {
  if (inProduction()) return new NextResponse(null, { status: 404 });
  return NextResponse.json({
    model: moderationModel(),
    minAge: minApparentAge(),
    minConfidence: MIN_CONFIDENCE,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT,
  });
}

interface CheckBody {
  image?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
}

/** Прогон одного фото с произвольными моделью и промптами. */
export async function POST(request: NextRequest) {
  if (inProduction()) return new NextResponse(null, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as CheckBody;
  if (!body.image?.startsWith("data:image/")) {
    return NextResponse.json({ error: "Нужно изображение" }, { status: 400 });
  }
  const apiKey = process.env.NANOGPT_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Не задан NANOGPT_API_KEY" }, { status: 500 });
  }

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${nanogptBaseUrl()}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body.model?.trim() || moderationModel(),
        messages: [
          { role: "system", content: body.systemPrompt?.trim() || SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: body.userPrompt?.trim() || USER_PROMPT },
              { type: "image_url", image_url: { url: body.image } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Запрос не прошёл" },
      { status: 502 },
    );
  }

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: `Провайдер вернул ${res.status}`, raw: text.slice(0, 600) },
      { status: 502 },
    );
  }

  let content = "";
  try {
    const payload = JSON.parse(text) as {
      choices?: { message?: { content?: string | null } }[];
    };
    content = payload.choices?.[0]?.message?.content ?? "";
  } catch {
    return NextResponse.json(
      { error: "Ответ провайдера не разобрался", raw: text.slice(0, 600) },
      { status: 502 },
    );
  }

  let assessment = null;
  let parseError: string | null = null;
  try {
    assessment = coerceAssessment(JSON.parse(content));
  } catch {
    parseError = content.slice(0, 600);
  }

  return NextResponse.json({
    assessment,
    parseError,
    // Решение прода (пороги из env/кода) — чтобы сравнивать со своими.
    prodAllowed: assessment ? isSourceAllowed(assessment) : null,
    elapsedMs: Date.now() - started,
    raw: content.slice(0, 1200),
  });
}
