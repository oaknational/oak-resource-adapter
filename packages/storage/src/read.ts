import { getStorage } from "./client.js";
import { readBucketName } from "./configuration.js";

export function isArtifactNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === 404 || error.code === "404")
  );
}

function artifactBucket() {
  const bucket = readBucketName();
  if (!bucket)
    throw new Error("RESOURCE_ARTIFACTS_BUCKET is required to read an artifact.");
  return getStorage().bucket(bucket);
}

export async function getArtifactMetadata(key: string) {
  const [metadata] = await artifactBucket().file(key).getMetadata();
  return metadata;
}

/**
 * The stream is scoped to the generation the metadata describes, so a caller
 * that derives a length or checksum from that metadata cannot then read the
 * bytes of a replacement.
 */
export async function readArtifact(key: string) {
  const metadata = await getArtifactMetadata(key);
  const files = artifactBucket();
  const pinned =
    metadata.generation === undefined
      ? files.file(key)
      : files.file(key, { generation: metadata.generation });
  return { metadata, stream: pinned.createReadStream() };
}
