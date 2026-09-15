/** Set together or not at all; the presence of the provider selects this path. */
export type FederatedIdentity = {
  serviceAccount: string;
  workloadIdentityProvider: string;
};

/** `incomplete` is a provider with no account to impersonate. */
export type IdentityConfiguration =
  | { kind: "application-default" }
  | { kind: "federated"; identity: FederatedIdentity }
  | { kind: "incomplete" };

export function readBucketName(): string | null {
  return process.env.RESOURCE_ARTIFACTS_BUCKET?.trim() || null;
}

export function readIdentityConfiguration(): IdentityConfiguration {
  const workloadIdentityProvider = process.env.GCP_WORKLOAD_IDENTITY_PROVIDER?.trim();

  if (!workloadIdentityProvider) {
    return { kind: "application-default" };
  }

  const serviceAccount = process.env.GCP_SERVICE_ACCOUNT?.trim();

  if (!serviceAccount) {
    return { kind: "incomplete" };
  }

  return {
    kind: "federated",
    identity: { serviceAccount, workloadIdentityProvider },
  };
}

/**
 * Returns null where application default credentials apply, which is locally.
 *
 * @throws when a provider is set with no account to impersonate.
 */
export function readFederatedIdentity(): FederatedIdentity | null {
  const configuration = readIdentityConfiguration();

  if (configuration.kind === "incomplete") {
    throw new Error(
      "GCP_SERVICE_ACCOUNT is required when GCP_WORKLOAD_IDENTITY_PROVIDER is set. " +
        "Impersonating a service account by OIDC needs both.",
    );
  }

  return configuration.kind === "federated" ? configuration.identity : null;
}
