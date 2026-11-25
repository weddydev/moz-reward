import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
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
  if (!SAFE_KEY.test(key) || key.length > 512)
    throw new Error(`invalid storage key: ${JSON.stringify(key)}`);
}

type Bucket = { client: S3Client; bucket: string };
const cached = new Map<"public" | "private", Bucket>();

/** One S3-compatible provider: MinIO in local/test (TESTING §9), Cloudflare R2 in staging/production. */
function s3(which: "public" | "private"): Bucket {
  const hit = cached.get(which);
  if (hit) return hit;
  const e = env();
  const bucket = which === "public" ? e.S3_BUCKET : e.S3_PRIVATE_BUCKET;
  const keyId = (which === "private" && e.S3_PRIVATE_ACCESS_KEY_ID) || e.S3_ACCESS_KEY_ID;
  const secret = (which === "private" && e.S3_PRIVATE_SECRET_ACCESS_KEY) || e.S3_SECRET_ACCESS_KEY;
  if (!bucket || !e.S3_ENDPOINT || !keyId || !secret) {
    throw new Error(
      which === "public"
        ? "Storage is not configured (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)"
        : "Private storage is not configured (S3_ENDPOINT, S3_PRIVATE_BUCKET and a key)",
    );
  }
  const made: Bucket = {
    bucket,
    client: new S3Client({
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: keyId, secretAccessKey: secret },
    }),
  };
  cached.set(which, made);
  return made;
}

const signal = (): AbortSignal => AbortSignal.timeout(TIMEOUT_MS);

function provider(which: "public" | "private"): StorageProvider {
  return {
    async put(key, body, contentType) {
      assertKey(key);
      const { client, bucket } = s3(which);
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
        { abortSignal: signal() },
      );
    },
    async get(key) {
      assertKey(key);
      const { client, bucket } = s3(which);
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
          abortSignal: signal(),
        });
        const bytes = await res.Body?.transformToByteArray();
        return { body: Buffer.from(bytes ?? []), contentType: res.ContentType };
      } catch (err) {
        if (err instanceof NoSuchKey) return null;
        throw err;
      }
    },
    async delete(key) {
      assertKey(key);
      const { client, bucket } = s3(which);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: signal(),
      });
    },
  };
}

/** The uploads bucket: its `public/` files are served by the CDN origin (ARCHITECTURE §8). */
export const storage: StorageProvider = provider("public");

/**
 * The private bucket (P1-12): files only the app streams after an authorisation check (receipt PDFs). It never
 * gets a public domain; env refuses it being the same bucket as `storage`.
 */
export const privateStorage: StorageProvider = provider("private");
