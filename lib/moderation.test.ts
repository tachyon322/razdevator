import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_CONFIDENCE,
  assessAge,
  isSourceAllowed,
  minApparentAge,
  moderationEnabled,
  type AgeAssessment,
} from "./moderation";

process.env.NANOGPT_API_KEY = process.env.NANOGPT_API_KEY ?? "test-key";

const adult: AgeAssessment = {
  persons: 1,
  faces: 1,
  minor: false,
  youngestAge: 30,
  confidence: 0.9,
  reason: "clearly an adult",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(impl: () => Response): typeof fetch {
  return (async () => impl()) as unknown as typeof fetch;
}

test("isSourceAllowed: уверенный взрослый — можно", () => {
  assert.equal(isSourceAllowed(adult), true);
});

test("isSourceAllowed: несовершеннолетний — нельзя", () => {
  assert.equal(isSourceAllowed({ ...adult, minor: true }), false);
});

test("isSourceAllowed: низкая уверенность — нельзя", () => {
  assert.equal(
    isSourceAllowed({ ...adult, confidence: MIN_CONFIDENCE - 0.01 }),
    false,
  );
});

test("isSourceAllowed: нет лица — нельзя", () => {
  assert.equal(isSourceAllowed({ ...adult, faces: 0 }), false);
});

test("isSourceAllowed: возраст неизвестен — нельзя", () => {
  assert.equal(isSourceAllowed({ ...adult, youngestAge: null }), false);
});

test("isSourceAllowed: порог по умолчанию — 18", () => {
  assert.equal(minApparentAge(), 18);
  assert.equal(isSourceAllowed({ ...adult, youngestAge: 17 }), false);
  assert.equal(isSourceAllowed({ ...adult, youngestAge: 18 }), true);
});

test("minApparentAge: переопределяется через env", () => {
  const prev = process.env.MODERATION_MIN_AGE;
  process.env.MODERATION_MIN_AGE = "18";
  try {
    assert.equal(minApparentAge(), 18);
    assert.equal(isSourceAllowed({ ...adult, youngestAge: 18 }), true);
  } finally {
    if (prev === undefined) delete process.env.MODERATION_MIN_AGE;
    else process.env.MODERATION_MIN_AGE = prev;
  }
});

test("moderationEnabled: по умолчанию включены, выключаются только явным false", () => {
  const prev = process.env.MODERATION_ENABLED;
  try {
    delete process.env.MODERATION_ENABLED;
    assert.equal(moderationEnabled(), true);
    process.env.MODERATION_ENABLED = "false";
    assert.equal(moderationEnabled(), false);
    process.env.MODERATION_ENABLED = "true";
    assert.equal(moderationEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.MODERATION_ENABLED;
    else process.env.MODERATION_ENABLED = prev;
  }
});

test("assessAge: разбирает ответ модели", async () => {
  const fetchImpl = stubFetch(() =>
    jsonResponse({ choices: [{ message: { content: JSON.stringify(adult) } }] }),
  );
  const result = await assessAge("data:image/png;base64,AAAA", { fetchImpl });
  assert.deepEqual(result, adult);
});

test("assessAge: ошибка провайдера — ModerationError", async () => {
  const fetchImpl = stubFetch(() => new Response("boom", { status: 500 }));
  await assert.rejects(
    () => assessAge("data:image/png;base64,AAAA", { fetchImpl }),
    /ошибку 500/,
  );
});

test("assessAge: не-JSON содержимое — ModerationError", async () => {
  const fetchImpl = stubFetch(() =>
    jsonResponse({ choices: [{ message: { content: "not json" } }] }),
  );
  await assert.rejects(
    () => assessAge("data:image/png;base64,AAAA", { fetchImpl }),
    /разобрать/,
  );
});

test("assessAge: пустой ответ — ModerationError", async () => {
  const fetchImpl = stubFetch(() => jsonResponse({ choices: [] }));
  await assert.rejects(
    () => assessAge("data:image/png;base64,AAAA", { fetchImpl }),
    /не вернула результат/,
  );
});

test("assessAge: пропущенное поле minor трактуется как несовершеннолетний", async () => {
  const fetchImpl = stubFetch(() =>
    jsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              persons: 1,
              faces: 1,
              youngestAge: 30,
              confidence: 0.9,
            }),
          },
        },
      ],
    }),
  );
  const result = await assessAge("data:image/png;base64,AAAA", { fetchImpl });
  assert.equal(result.minor, true);
  assert.equal(isSourceAllowed(result), false);
});
