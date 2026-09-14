import { getStorage } from "./client.js";
import { readBucketName } from "./configuration.js";
import { describeCause } from "./errors.js";

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 404
  );
}

/**
 * No prefix or wildcard form: one key at a time, so a bug cannot empty the
 * bucket.
 *
 * @returns whether there was an object to remove.
 */
export async function deleteArtifact(key: string): Promise<boolean> {
  const bucket = readBucketName();

  if (!bucket) {
    throw new Error("RESOURCE_ARTIFACTS_BUCKET is required to delete an artifact.");
  }

  try {
    await getStorage().bucket(bucket).file(key).delete();

    return true;
  } catch (cause) {
    if (isNotFound(cause)) {
      return false;
    }

    throw new Error(
      `Could not delete "${key}" from ${bucket}: ${describeCause(cause)}`,
      { cause },
    );
  }
}
