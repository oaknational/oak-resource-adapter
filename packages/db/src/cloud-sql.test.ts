import { AuthTypes, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildExternalAccountOptions,
  createCloudSqlPoolConfig,
  readCloudSqlConfig,
  type CloudSqlConfig,
} from "./cloud-sql.js";

const getOptions = vi.fn();

vi.mock("@google-cloud/cloud-sql-connector", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@google-cloud/cloud-sql-connector")>()),
  Connector: class {
    getOptions = getOptions;
  },
}));

vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: vi.fn(async () => "a-vercel-oidc-token"),
}));

const config: CloudSqlConfig = {
  database: "resource_adapter",
  instanceConnectionName: "oak:europe-west2:ora-stg",
  ipType: IpAddressTypes.PUBLIC,
  serviceAccount: "ora-app@oak.iam.gserviceaccount.com",
  user: "ora-app@oak.iam",
  workloadIdentityProvider:
    "projects/1/locations/global/workloadIdentityPools/vercel/providers/ora",
};

const completeEnv = {
  CLOUD_SQL_DATABASE: "resource_adapter",
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: "oak:europe-west2:ora-stg",
  CLOUD_SQL_USER: "ora-app@oak.iam",
  GCP_SERVICE_ACCOUNT: "ora-app@oak.iam.gserviceaccount.com",
  GCP_WORKLOAD_IDENTITY_PROVIDER:
    "projects/1/locations/global/workloadIdentityPools/vercel/providers/ora",
};

function setEnv(values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) {
    vi.stubEnv(name, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readCloudSqlConfig", () => {
  it("returns null when no instance is configured, which is the local case", () => {
    expect(readCloudSqlConfig()).toBeNull();
  });

  it("reads a complete configuration", () => {
    setEnv(completeEnv);

    expect(readCloudSqlConfig()).toEqual({
      database: "resource_adapter",
      instanceConnectionName: "oak:europe-west2:ora-stg",
      ipType: IpAddressTypes.PUBLIC,
      serviceAccount: "ora-app@oak.iam.gserviceaccount.com",
      user: "ora-app@oak.iam",
      workloadIdentityProvider:
        "projects/1/locations/global/workloadIdentityPools/vercel/providers/ora",
    });
  });

  // Naming the missing value beats failing later inside the connector.
  it.each(
    Object.keys(completeEnv).filter((n) => n !== "CLOUD_SQL_INSTANCE_CONNECTION_NAME"),
  )("refuses a configuration missing %s", (missing) => {
    setEnv(completeEnv);
    vi.stubEnv(missing, "");

    expect(() => readCloudSqlConfig()).toThrowError(missing);
  });

  it("accepts a private IP instance", () => {
    setEnv({ ...completeEnv, CLOUD_SQL_IP_TYPE: "private" });

    expect(readCloudSqlConfig()?.ipType).toBe(IpAddressTypes.PRIVATE);
  });

  it("refuses an IP type the connector would not understand", () => {
    setEnv({ ...completeEnv, CLOUD_SQL_IP_TYPE: "internal" });

    expect(() => readCloudSqlConfig()).toThrowError("CLOUD_SQL_IP_TYPE");
  });
});

describe("buildExternalAccountOptions", () => {
  it("addresses the workload identity provider GCP's STS expects", () => {
    const options = buildExternalAccountOptions(config);

    expect(options.audience).toBe(
      "//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/vercel/providers/ora",
    );
    expect(options.service_account_impersonation_url).toBe(
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
        "ora-app@oak.iam.gserviceaccount.com:generateAccessToken",
    );
  });

  it("declares a JWT subject token exchanged against the public STS endpoint", () => {
    const options = buildExternalAccountOptions(config);

    expect(options).toMatchObject({
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      type: "external_account",
    });
  });

  // Resolving the token here rather than at construction is what lets a
  // per-request header be picked up.
  it("reads Vercel's token at exchange time", async () => {
    const { getVercelOidcToken } = await import("@vercel/oidc");
    const options = buildExternalAccountOptions(config);

    expect(getVercelOidcToken).not.toHaveBeenCalled();
    await expect(options.subject_token_supplier.getSubjectToken()).resolves.toBe(
      "a-vercel-oidc-token",
    );
  });
});

describe("createCloudSqlPoolConfig", () => {
  it("asks the connector for an IAM-authenticated tunnel to the configured instance", async () => {
    getOptions.mockResolvedValue({ stream: () => undefined });

    await createCloudSqlPoolConfig(config);

    expect(getOptions).toHaveBeenCalledWith({
      authType: AuthTypes.IAM,
      instanceConnectionName: "oak:europe-west2:ora-stg",
      ipType: IpAddressTypes.PUBLIC,
    });
  });

  // pg needs the database and user alongside the connector's stream; omitting
  // either connects to the wrong place with the wrong identity.
  it("keeps the connector's stream and adds the database and user", async () => {
    const stream = () => undefined;
    getOptions.mockResolvedValue({ stream });

    await expect(createCloudSqlPoolConfig(config)).resolves.toEqual({
      database: "resource_adapter",
      stream,
      user: "ora-app@oak.iam",
    });
  });

  it("never sends a password, because IAM replaces it", async () => {
    getOptions.mockResolvedValue({ stream: () => undefined });

    expect(await createCloudSqlPoolConfig(config)).not.toHaveProperty("password");
  });
});
