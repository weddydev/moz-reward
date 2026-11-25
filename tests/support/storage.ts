import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

/** Creates the local/test buckets (public + private) in MinIO if they don't exist (idempotent). */
export async function ensureBucket(): Promise<void> {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) return;
  for (const bucket of [process.env.S3_BUCKET, process.env.S3_PRIVATE_BUCKET]) {
    if (bucket) await ensureOne(endpoint, bucket);
  }
}

async function ensureOne(endpoint: string, bucket: string): Promise<void> {
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (err) {
      throw new Error(
        `MinIO is not reachable or the bucket could not be created. Run \`pnpm services:up\`. (${(err as Error).name})`,
      );
    }
  } finally {
    client.destroy();
  }
}
