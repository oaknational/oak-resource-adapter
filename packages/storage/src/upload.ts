import { Storage } from "@google-cloud/storage";

import {
  readBucketName,
  readFederatedIdentity,
  type FederatedIdentity,
} from "./configuration.js";
import { createFederatedAuthClient } from "./credentials.js";

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

let cachedStorage: { client: Storage; key: string } | undefined;

function createStorage(identity: FederatedIdentity | null): Storage {
  return identity
    ? new Storage({ authClient: createFederatedAuthClient(identity) })
    : new Storage();
}

function getStorage(identity: FederatedIdentity | null): Storage {
  const key = identity
    ? `${identity.workloadIdentityProvider}|${identity.serviceAccount}`
    : "application-default";

  // The impersonated access token is cached inside the auth client, so building
  // a Storage per upload would repeat the STS exchange every time.
  if (cachedStorage?.key !== key) {
    cachedStorage = { client: createStorage(identity), key };
  }

  return cachedStorage.client;
}

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
  const file = getStorage(readFederatedIdentity()).bucket(bucket).file(key);

  try {
    await file.save(body, {
      contentType,
      // GCS for "only if absent": a repeated key fails rather than replacing.
      preconditionOpts: { ifGenerationMatch: 0 },
      resumable: false,
    });
  } catch (cause) {
    throw new Error(`Could not upload "${key}" to ${bucket}.`, { cause });
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
