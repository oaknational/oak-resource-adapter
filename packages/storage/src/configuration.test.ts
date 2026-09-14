import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readBucketName,
  readFederatedIdentity,
  readIdentityConfiguration,
} from "./configuration.js";

const provider =
  "projects/1/locations/global/workloadIdentityPools/vercel/providers/vercel";
const serviceAccount = "wif-vercel-ora@oak.iam.gserviceaccount.com";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readBucketName", () => {
  it("returns null when unset", () => {
    expect(readBucketName()).toBeNull();
  });

  it("treats whitespace as unset", () => {
    vi.stubEnv("RESOURCE_ARTIFACTS_BUCKET", "   ");

    expect(readBucketName()).toBeNull();
  });

  it("trims the configured name", () => {
    vi.stubEnv("RESOURCE_ARTIFACTS_BUCKET", " oak-ow-staging-ldn-ora-artifacts ");

    expect(readBucketName()).toBe("oak-ow-staging-ldn-ora-artifacts");
  });
});

describe("readIdentityConfiguration", () => {
  it("falls back to application default credentials with no provider", () => {
    expect(readIdentityConfiguration()).toEqual({ kind: "application-default" });
  });

  it("reads a complete identity", () => {
    vi.stubEnv("GCP_SERVICE_ACCOUNT", serviceAccount);
    vi.stubEnv("GCP_WORKLOAD_IDENTITY_PROVIDER", provider);

    expect(readIdentityConfiguration()).toEqual({
      kind: "federated",
      identity: { serviceAccount, workloadIdentityProvider: provider },
    });
  });

  it("reports a provider with no account to impersonate", () => {
    vi.stubEnv("GCP_WORKLOAD_IDENTITY_PROVIDER", provider);

    expect(readIdentityConfiguration()).toEqual({ kind: "incomplete" });
  });
});

describe("readFederatedIdentity", () => {
  it("returns null where application default credentials apply", () => {
    expect(readFederatedIdentity()).toBeNull();
  });

  it("refuses a provider with no account to impersonate", () => {
    vi.stubEnv("GCP_WORKLOAD_IDENTITY_PROVIDER", provider);

    expect(() => readFederatedIdentity()).toThrowError("GCP_SERVICE_ACCOUNT");
  });
});
