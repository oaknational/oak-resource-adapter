import { randomUUID } from "node:crypto";

import {
  getDatabaseClient,
  resourceArtifacts,
  type ResourceArtifact,
} from "@oaknational/resource-adapter-db";
import { artifactKey, uploadArtifact } from "@oaknational/resource-adapter-storage";

import { storageEnvironment } from "../environment";

export async function storeResourceArtifact(
  bytes: Buffer | Uint8Array,
  resourceDocumentId: string,
  mimeType: string,
  format: string,
): Promise<ResourceArtifact> {
  const storageKey = artifactKey(storageEnvironment(), [randomUUID()]);

  // Upload first: a failed insert may leave an object, never a row without bytes.
  // Retries use fresh keys; cleanup and deduplication do not belong here.
  const uploaded = await uploadArtifact({
    body: bytes,
    contentType: mimeType,
    key: storageKey,
  });

  const [artifact] = await getDatabaseClient()
    .insert(resourceArtifacts)
    .values({
      byteSize: bytes.byteLength,
      checksum: uploaded.md5Hash ?? null,
      format,
      mimeType,
      resourceDocumentId,
      storageKey,
    })
    .returning();

  if (artifact === undefined) {
    throw new Error("The resource artifact insert returned no row.");
  }

  return artifact;
}
