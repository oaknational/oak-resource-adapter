import { getStorage, isFederated } from "./client.js";
import { readBucketName } from "./configuration.js";
import { deleteArtifact } from "./delete.js";
import { describeRootCause } from "./errors.js";
import { artifactKey, type ArtifactEnvironment } from "./key.js";
import { uploadArtifact } from "./upload.js";

export type ArtifactStorageRoundTrip = {
  bucket: string;
  byteSize: number;
  crc32c: string;
  /** False where application default credentials were used instead. */
  federated: boolean;
  key: string;
};

const payload = "resource-adapter storage round trip";

/**
 * Carries the context a failure needs as fields, leaving the message to read as
 * the reason alone.
 */
export class ArtifactStorageRoundTripError extends Error {
  readonly bucket: string;
  readonly cleanupError: unknown;
  readonly cleanupMessage: string | undefined;
  readonly federated: boolean;
  readonly key: string;

  constructor(
    key: string,
    bucket: string,
    federated: boolean,
    cause: unknown,
    {
      cleanupError,
      stage = "write-read",
    }: { cleanupError?: unknown; stage?: "write-read" | "cleanup" } = {},
  ) {
    super(
      stage === "cleanup"
        ? "Wrote and read back the object, but cleanup failed."
        : describeRootCause(cause),
      { cause },
    );
    this.name = "ArtifactStorageRoundTripError";
    this.bucket = bucket;
    this.cleanupError = stage === "cleanup" ? cause : cleanupError;
    this.cleanupMessage =
      this.cleanupError === undefined
        ? undefined
        : describeRootCause(this.cleanupError);
    this.federated = federated;
    this.key = key;
  }
}

/**
 * Writes a small object, reads it back, and deletes it, so a deployment can
 * prove the whole credential chain rather than only that its variables are set.
 *
 * The delete runs even when the read fails, and never masks the original error.
 *
 * @throws when any step fails, or the bytes read back differ.
 */
export async function roundTripArtifactStorage(
  environment: ArtifactEnvironment,
): Promise<ArtifactStorageRoundTrip> {
  const key = artifactKey(environment, [
    "_round-trip",
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    "probe.txt",
  ]);

  const federated = isFederated();
  const bucket = readBucketName();

  if (!bucket) {
    throw new Error("RESOURCE_ARTIFACTS_BUCKET is required to round trip an artifact.");
  }

  let written;

  try {
    written = await uploadArtifact({
      body: Buffer.from(payload),
      contentType: "text/plain",
      key,
    });

    const [read] = await getStorage().bucket(bucket).file(key).download();

    if (read.toString() !== payload) {
      throw new Error(`Read back different bytes from "${key}".`);
    }
  } catch (cause) {
    let cleanupError: unknown;

    try {
      await deleteArtifact(key);
    } catch (error) {
      cleanupError = error;
    }

    throw new ArtifactStorageRoundTripError(key, bucket, federated, cause, {
      cleanupError,
    });
  }

  try {
    await deleteArtifact(key);
  } catch (cause) {
    throw new ArtifactStorageRoundTripError(key, bucket, federated, cause, {
      stage: "cleanup",
    });
  }

  return {
    bucket: written.bucket,
    byteSize: written.byteSize,
    crc32c: written.crc32c,
    federated,
    key,
  };
}
