import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabaseClient, initialiseDatabaseClient } from "./client.js";

// Only the connector is stubbed; readCloudSqlConfig stays real so these
// exercise the same configuration reading a deployment would.
const createCloudSqlPoolConfig = vi.fn(async () => ({ stream: () => undefined }));

vi.mock("./cloud-sql.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cloud-sql.js")>()),
  createCloudSqlPoolConfig,
}));

const cloudSqlEnv = {
  CLOUD_SQL_DATABASE: "resource_adapter",
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: "oak:europe-west2:ora-stg",
  CLOUD_SQL_USER: "ora-app@oak.iam",
  GCP_SERVICE_ACCOUNT: "ora-app@oak.iam.gserviceaccount.com",
  GCP_WORKLOAD_IDENTITY_PROVIDER:
    "projects/1/locations/global/workloadIdentityPools/vercel/providers/ora",
};

function configureCloudSql(): void {
  for (const [name, value] of Object.entries(cloudSqlEnv)) {
    vi.stubEnv(name, value);
  }
}

const globalDatabase = globalThis as typeof globalThis & {
  resourceAdapterDatabaseClient?: unknown;
  resourceAdapterDatabaseKey?: string;
};

beforeEach(() => {
  delete globalDatabase.resourceAdapterDatabaseClient;
  delete globalDatabase.resourceAdapterDatabaseKey;
  createCloudSqlPoolConfig.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getDatabaseClient", () => {
  it("connects from DATABASE_URL, which is the local and CI transport", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user@localhost:5432/resource_adapter");

    expect(getDatabaseClient()).toBeDefined();
  });

  it("reuses the client while DATABASE_URL is unchanged", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user@localhost:5432/resource_adapter");

    expect(getDatabaseClient()).toBe(getDatabaseClient());
  });

  it("rebuilds the client when DATABASE_URL changes", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user@localhost:5432/one");
    const first = getDatabaseClient();

    vi.stubEnv("DATABASE_URL", "postgresql://user@localhost:5432/two");

    expect(getDatabaseClient()).not.toBe(first);
  });

  it("says so when DATABASE_URL is missing", () => {
    vi.stubEnv("DATABASE_URL", "");

    expect(() => getDatabaseClient()).toThrowError("DATABASE_URL is required");
  });

  // Falling through to DATABASE_URL here would try to reach the instance
  // directly, which has no route.
  it("refuses to guess when Cloud SQL is configured but not initialised", () => {
    vi.stubEnv("CLOUD_SQL_INSTANCE_CONNECTION_NAME", "oak:europe-west2:ora-stg");
    vi.stubEnv("DATABASE_URL", "postgresql://user@localhost:5432/resource_adapter");

    expect(() => getDatabaseClient()).toThrowError("initialiseDatabaseClient");
  });
});

describe("initialiseDatabaseClient", () => {
  it("does nothing when DATABASE_URL is the transport", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user@localhost:5432/resource_adapter");

    await initialiseDatabaseClient();

    expect(globalDatabase.resourceAdapterDatabaseClient).toBeUndefined();
  });

  it("surfaces an incomplete Cloud SQL configuration at startup", async () => {
    vi.stubEnv("CLOUD_SQL_INSTANCE_CONNECTION_NAME", "oak:europe-west2:ora-stg");

    await expect(initialiseDatabaseClient()).rejects.toThrowError("CLOUD_SQL_DATABASE");
  });

  it("builds a Cloud SQL client that getDatabaseClient then returns", async () => {
    configureCloudSql();

    await initialiseDatabaseClient();

    expect(createCloudSqlPoolConfig).toHaveBeenCalledOnce();
    expect(getDatabaseClient()).toBeDefined();
  });

  // Rebuilding would open a fresh pool on every serverless invocation.
  it("does not rebuild when already initialised for the same instance", async () => {
    configureCloudSql();

    await initialiseDatabaseClient();
    await initialiseDatabaseClient();

    expect(createCloudSqlPoolConfig).toHaveBeenCalledOnce();
  });
});
