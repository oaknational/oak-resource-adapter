import { IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readCloudSqlConfig } from "./cloud-sql.js";

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
