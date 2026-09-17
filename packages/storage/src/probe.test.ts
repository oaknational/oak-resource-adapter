import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { probeArtifactStorage } from "./probe.js";

const provider =
  "projects/1/locations/global/workloadIdentityPools/vercel/providers/vercel";
const serviceAccount = "wif-vercel-ora@oak.iam.gserviceaccount.com";

beforeEach(() => {
  vi.stubEnv("RESOURCE_ARTIFACTS_BUCKET", "oak-ow-staging-ldn-ora-artifacts");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubFederatedIdentity(): void {
  vi.stubEnv("GCP_SERVICE_ACCOUNT", serviceAccount);
  vi.stubEnv("GCP_WORKLOAD_IDENTITY_PROVIDER", provider);
}

describe("probeArtifactStorage", () => {
  it("passes locally on application default credentials alone", () => {
    expect(probeArtifactStorage({ requireFederatedIdentity: false })).toBeNull();
  });

  it("passes on a deployment with a complete federated identity", () => {
    stubFederatedIdentity();

    expect(probeArtifactStorage({ requireFederatedIdentity: true })).toBeNull();
  });

  it("reports a deployment with no federated identity to impersonate with", () => {
    expect(probeArtifactStorage({ requireFederatedIdentity: true })).toBe(
      "identity-not-federated",
    );
  });

  it("reports a half-configured identity wherever it runs", () => {
    vi.stubEnv("GCP_WORKLOAD_IDENTITY_PROVIDER", provider);

    for (const requireFederatedIdentity of [true, false]) {
      expect(probeArtifactStorage({ requireFederatedIdentity })).toBe(
        "identity-incomplete",
      );
    }
  });

  it("reports a missing bucket ahead of the identity, since neither can write", () => {
    vi.stubEnv("RESOURCE_ARTIFACTS_BUCKET", "");
    stubFederatedIdentity();

    expect(probeArtifactStorage({ requireFederatedIdentity: true })).toBe(
      "bucket-not-configured",
    );
  });
});
