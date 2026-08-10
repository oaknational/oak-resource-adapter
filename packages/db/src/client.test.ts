import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabaseClient, initialiseDatabaseClient } from "./client.js";

const globalDatabase = globalThis as typeof globalThis & {
  resourceAdapterDatabaseClient?: unknown;
  resourceAdapterDatabaseKey?: string;
};

beforeEach(() => {
  delete globalDatabase.resourceAdapterDatabaseClient;
  delete globalDatabase.resourceAdapterDatabaseKey;
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
});
