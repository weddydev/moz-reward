import "server-only";
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/server/env";

export type StoredObject = { body: Buffer; contentType: string | undefined };

export interface StorageProvider {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

const TIMEOUT_MS = 15_000;
/** Relative keys made of safe segments only: no leading slash, no `.`/`..` segments, no backslashes. */
const SAFE_KEY = /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._\-/]+$/;

function assertKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.length > 512) throw new Error(`invalid storage key: ${JSON.stringify(key)}`);
}

let cached: { client: S3Client; bucket: string } | undefined;

/** One S3-compatible provider: MinIO in local/test (TESTING §9), Cloudflare R2 in staging/production. */
function s3(): { client: S3Client; bucket: string } {
  if (cached) return cached;
  const e = env();
  if (!e.S3_BUCKET || !e.S3_ENDPOINT || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) {
    throw new Error("Storage is not configured (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)");
  }
  cached = {
    bucket: e.S3_BUCKET,
    client: new S3Client({
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    }),
  };
  return cached;
}

const signal = (): AbortSignal => AbortSignal.timeout(TIMEOUT_MS);

export const storage: StorageProvider = {
  async put(key, body, contentType) {
    assertKey(key);
    const { client, bucket } = s3();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }), { abortSignal: signal() });
  },
  async get(key) {
    assertKey(key);
    const { client, bucket } = s3();
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal() });
      const bytes = await res.Body?.transformToByteArray();
      return { body: Buffer.from(bytes ?? []), contentType: res.ContentType };
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      throw err;
    }
  },
  async delete(key) {
    assertKey(key);
    const { client, bucket } = s3();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal() });
  },
};
