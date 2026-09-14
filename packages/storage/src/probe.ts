import { readBucketName, readIdentityConfiguration } from "./configuration.js";

export type StorageProbeFailure =
  "bucket-not-configured" | "identity-incomplete" | "identity-not-federated";

/**
 * Checks storage configuration without verifying credentials or bucket access.
 *
 * `requireFederatedIdentity` is the caller's judgement rather than this
 * package's: a deployment has no application default credentials to fall back
 * on, but a local process does, and only the caller knows which it is.
 */
export function probeArtifactStorage({
  requireFederatedIdentity,
}: {
  requireFederatedIdentity: boolean;
}): StorageProbeFailure | null {
  if (!readBucketName()) {
    return "bucket-not-configured";
  }

  const identity = readIdentityConfiguration();

  if (identity.kind === "incomplete") {
    return "identity-incomplete";
  }

  return requireFederatedIdentity && identity.kind !== "federated"
    ? "identity-not-federated"
    : null;
}
