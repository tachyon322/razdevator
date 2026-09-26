/**
 * Представление генерации для клиента: S3-ключи превращаются в ссылки
 * `/api/files/...`, которые раздаются с проверкой владельца.
 */

import type { GenerationAsset, GenerationParams, GenerationStatus, GenerationWithAssets } from "./db";

export type { GenerationKind } from "./db";

export interface GenerationAssetDTO {
  id: string;
  kind: "image" | "video";
  url: string;
  contentType: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  position: number;
}

export interface GenerationDTO {
  id: string;
  kind: "image" | "video";
  status: GenerationStatus;
  prompt: string;
  params: GenerationParams;
  sourceUrl: string | null;
  error: string | null;
  favorite: boolean;
  costUsd: number | null;
  createdAt: string;
  updatedAt: string;
  assets: GenerationAssetDTO[];
}

/**
 * Урезанное представление для списков: без промпта и параметров, чтобы
 * не раздувать ответ галереи. Промпт догружается вместе с деталями.
 */
export interface GenerationSummaryDTO {
  id: string;
  kind: "image" | "video";
  status: GenerationStatus;
  error: string | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  assets: GenerationAssetDTO[];
}

/** Ссылка на файл по S3-ключу (сегменты кодируются по отдельности). */
export function fileUrl(key: string): string {
  const path = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/api/files/${path}`;
}

function toAssetDTO(asset: GenerationAsset): GenerationAssetDTO {
  return {
    id: asset.id,
    kind: asset.kind,
    url: fileUrl(asset.s3Key),
    contentType: asset.contentType,
    width: asset.width,
    height: asset.height,
    durationSec: asset.durationSec,
    position: asset.position,
  };
}

export function toGenerationDTO(
  generation: GenerationWithAssets,
): GenerationDTO {
  return {
    id: generation.id,
    kind: generation.kind,
    status: generation.status,
    prompt: generation.prompt,
    params: generation.params,
    sourceUrl: generation.sourceKey ? fileUrl(generation.sourceKey) : null,
    error: generation.error,
    favorite: generation.favorite,
    costUsd: generation.costUsd,
    createdAt: generation.createdAt,
    updatedAt: generation.updatedAt,
    assets: generation.assets.map(toAssetDTO),
  };
}

export function toGenerationSummaryDTO(
  generation: GenerationWithAssets,
): GenerationSummaryDTO {
  return {
    id: generation.id,
    kind: generation.kind,
    status: generation.status,
    error: generation.error,
    favorite: generation.favorite,
    createdAt: generation.createdAt,
    updatedAt: generation.updatedAt,
    assets: generation.assets.map(toAssetDTO),
  };
}
