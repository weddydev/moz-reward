import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

/** Creates the local/test bucket in MinIO if it doesn't exist (idempotent). */
export async function ensureBucket(): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  const endpoint = process.env.S3_ENDPOINT;
  if (!bucket || !endpoint) return;
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (err) {
      throw new Error(`MinIO is not reachable or the bucket could not be created. Run \`pnpm services:up\`. (${(err as Error).name})`);
    }
  } finally {
    client.destroy();
  }
}
