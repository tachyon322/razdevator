import { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/** Серверный потолок размера запроса (страховка в глубину). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/** Поддерживаемые MIME-типы изображений (для приёма фото от клиента). */
export function isSupportedImage(mime: string): boolean {
  return (
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    mime === "image/png" ||
    mime === "image/webp"
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

function bucketName(): string {
  return process.env.S3_BUCKET ?? "razdevator";
}

let client: S3Client | null = null;

/** Ленивая инициализация клиента: на этапе сборки env может отсутствовать. */
function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    endpoint: requireEnv("S3_ENDPOINT"),
    region: process.env.S3_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY"),
      secretAccessKey: requireEnv("S3_SECRET_KEY"),
    },
    // SeaweedFS обслуживает bucket-адреса по path style.
    forcePathStyle: true,
  });
  return client;
}

function extensionFor(mime: string): string {
  return EXTENSIONS[mime] ?? "bin";
}

/** Ключ исходного фото клиента: sources/{userId}/{uuid}.{ext}. */
export function buildSourceKey(userId: string, mime: string): string {
  return `sources/${userId}/${crypto.randomUUID()}.${extensionFor(mime)}`;
}

/** Ключ результата генерации: generations/{userId}/{uuid}.{ext}. */
export function buildGenerationKey(userId: string, mime: string): string {
  return `generations/${userId}/${crypto.randomUUID()}.${extensionFor(mime)}`;
}

/** Проверка, что ключ принадлежит пользователю (владение по префиксу). */
export function isOwnedBy(key: string, userId: string): boolean {
  return (
    key.startsWith(`sources/${userId}/`) ||
    key.startsWith(`generations/${userId}/`) ||
    key.startsWith(`uploads/${userId}/`)
  );
}

let bucketReady: Promise<void> | null = null;

/** Создаёт бакет при первом обращении; результат кэшируется на процесс. */
export function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const s3 = getClient();
      const Bucket = bucketName();
      try {
        await s3.send(new HeadBucketCommand({ Bucket }));
      } catch (error) {
        const name = (error as { name?: string }).name;
        const status = (error as { $metadata?: { httpStatusCode?: number } })
          .$metadata?.httpStatusCode;
        if (name === "NotFound" || name === "NoSuchBucket" || status === 404) {
          await s3.send(new CreateBucketCommand({ Bucket }));
        } else {
          throw error;
        }
      }
    })().catch((error) => {
      bucketReady = null;
      throw error;
    });
  }
  return bucketReady;
}

/** Универсальная запись объекта (изображение, видео и т.п.). */
export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export interface ObjectRange {
  start: number;
  /** Верхняя граница включительно; не задана — до конца объекта. */
  end?: number;
}

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength?: number;
  contentRange?: string;
  statusCode?: number;
  etag?: string;
  lastModified?: Date;
}

export async function getObject(
  key: string,
  range?: ObjectRange,
): Promise<StoredObject> {
  const rangeHeader = range
    ? `bytes=${range.start}-${range.end ?? ""}`
    : undefined;

  const out = await getClient().send(
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
      ...(rangeHeader ? { Range: rangeHeader } : {}),
    }),
  );
  const body = out.Body;
  if (!body) throw new Error(`Пустой объект: ${key}`);

  const stream =
    body instanceof Readable
      ? (Readable.toWeb(body) as ReadableStream<Uint8Array>)
      : body instanceof Blob
        ? body.stream()
        : (body as ReadableStream<Uint8Array>);

  return {
    body: stream,
    contentType: out.ContentType ?? "application/octet-stream",
    contentLength: out.ContentLength,
    contentRange: out.ContentRange,
    statusCode: out.$metadata?.httpStatusCode,
    etag: out.ETag,
    lastModified: out.LastModified,
  };
}

export interface ObjectMeta {
  etag?: string;
  lastModified?: Date;
  contentLength?: number;
  contentType?: string;
}

/**
 * Метаданные объекта без тела — для условных запросов (`If-None-Match`).
 * Возвращает `null`, если объекта нет.
 */
export async function headObject(key: string): Promise<ObjectMeta | null> {
  try {
    const out = await getClient().send(
      new HeadObjectCommand({ Bucket: bucketName(), Key: key }),
    );
    return {
      etag: out.ETag,
      lastModified: out.LastModified,
      contentLength: out.ContentLength,
      contentType: out.ContentType,
    };
  } catch (error) {
    const name = (error as { name?: string }).name;
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (name === "NotFound" || name === "NoSuchKey" || status === 404) {
      return null;
    }
    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: bucketName(), Key: key }),
  );
}
