import { test } from "node:test";
import assert from "node:assert/strict";
import { absoluteProviderUrl, fetchAsset, getVideoStatus } from "./nanogpt";

process.env.NANOGPT_API_KEY = process.env.NANOGPT_API_KEY ?? "test-key";
process.env.NANOGPT_BASE_URL = "https://nano-gpt.com/api";

/**
 * Реальный ответ NanoGPT на /video/status (23.11.2026): готовое видео отдаётся
 * относительным путём, а не абсолютным URL. На этом прод-генерация падала с
 * «Некорректная ссылка на результат.»
 */
const VIDEO_STATUS_PAYLOAD = {
  data: {
    status: "COMPLETED",
    request_id: "vid_mwt6qohwbe2aff78763b",
    output: {
      video: {
        url: "/api/generate-video/content?runId=vid_mwt6qohwbe2aff78763b&variant=video-0&expires=1795520148&sig=v2.abc",
      },
      videoUrls: [
        "/api/generate-video/content?runId=vid_mwt6qohwbe2aff78763b&variant=video-0&expires=1795520148&sig=v2.abc",
      ],
      expiresAt: "2026-11-24T11:34:16.431Z",
    },
  },
};

function stubFetch(handler: (url: string) => Response): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    handler(String(input))) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("absoluteProviderUrl: относительный путь видео резолвится от базы", () => {
  assert.equal(
    absoluteProviderUrl("/api/generate-video/content?runId=x&sig=y"),
    "https://nano-gpt.com/api/generate-video/content?runId=x&sig=y",
  );
});

test("absoluteProviderUrl: абсолютная ссылка не меняется", () => {
  const url = "https://cdn.example.com/a.mp4";
  assert.equal(absoluteProviderUrl(url), url);
});

test("getVideoStatus: COMPLETED с относительной ссылкой → абсолютный videoUrl", async () => {
  const restore = stubFetch(
    () =>
      new Response(JSON.stringify(VIDEO_STATUS_PAYLOAD), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  try {
    const status = await getVideoStatus("vid_mwt6qohwbe2aff78763b");
    assert.equal(status.status, "COMPLETED");
    assert.equal(
      status.videoUrl,
      "https://nano-gpt.com/api/generate-video/content?runId=vid_mwt6qohwbe2aff78763b&variant=video-0&expires=1795520148&sig=v2.abc",
    );
  } finally {
    restore();
  }
});

test("fetchAsset: качает видео по относительной ссылке", async () => {
  let requested = "";
  const restore = stubFetch((url) => {
    requested = url;
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "video/mp4" },
    });
  });
  try {
    const file = await fetchAsset(
      "/api/generate-video/content?runId=vid_1&sig=v2.abc",
    );
    assert.equal(
      requested,
      "https://nano-gpt.com/api/generate-video/content?runId=vid_1&sig=v2.abc",
    );
    assert.equal(file.contentType, "video/mp4");
    assert.equal(file.bytes.byteLength, 3);
  } finally {
    restore();
  }
});
