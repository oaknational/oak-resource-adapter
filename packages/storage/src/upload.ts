import { getStorage } from "./client.js";
import { readBucketName } from "./configuration.js";
import { describeCause } from "./errors.js";

export type UploadArtifactInput = {
  body: Buffer | Uint8Array;
  contentType: string;
  /** Unique within the bucket; an existing key is never overwritten. */
  key: string;
};

export type UploadedArtifact = {
  bucket: string;
  byteSize: number;
  crc32c: string;
  key: string;
  md5Hash: string | undefined;
};

function requireBucketName(): string {
  const bucket = readBucketName();

  if (!bucket) {
    throw new Error("RESOURCE_ARTIFACTS_BUCKET is required to upload an artifact.");
  }

  return bucket;
}

/**
 * Writes bytes to the resource artifacts bucket and resolves with what GCS
 * recorded, so a caller can persist a checksum without reading the object back.
 *
 * Authenticates by Workload Identity Federation where
 * `GCP_WORKLOAD_IDENTITY_PROVIDER` is set, and by application default
 * credentials otherwise.
 *
 * @throws if the key already exists, or the upload fails.
 */
export async function uploadArtifact({
  body,
  contentType,
  key,
}: UploadArtifactInput): Promise<UploadedArtifact> {
  const bucket = requireBucketName();
  const file = getStorage().bucket(bucket).file(key);

  try {
    await file.save(body, {
      contentType,
      // GCS for "only if absent": a repeated key fails rather than replacing.
      preconditionOpts: { ifGenerationMatch: 0 },
      resumable: false,
    });
  } catch (cause) {
    throw new Error(`Could not upload "${key}" to ${bucket}: ${describeCause(cause)}`, {
      cause,
    });
  }

  const { crc32c, md5Hash, size } = file.metadata;

  if (crc32c === undefined || size === undefined) {
    throw new Error(
      `Uploaded "${key}" to ${bucket}, but the response carried no checksum or size.`,
    );
  }

  return {
    bucket,
    // GCS reports size as a string.
    byteSize: Number(size),
    crc32c,
    key,
    md5Hash,
  };
}
