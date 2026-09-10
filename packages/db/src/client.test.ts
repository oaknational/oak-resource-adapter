import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUrlPoolConfig,
  getDatabaseClient,
  initialiseDatabaseClient,
} from "./client.js";

// Only the connector is stubbed; readCloudSqlConfig stays real so these
// exercise the same configuration reading a deployment would.
const createCloudSqlPoolConfig = vi.fn(async () => ({ stream: () => undefined }));

vi.mock("./cloud-sql.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cloud-sql.js")>()),
  createCloudSqlPoolConfig,
}));

const certificateAuthority =
  "-----BEGIN CERTIFICATE-----\nstaging-instance\n-----END CERTIFICATE-----";

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
  vi.stubEnv("DATABASE_CA_CERT", "");
  for (const name of Object.keys(cloudSqlEnv)) {
    vi.stubEnv(name, "");
  }
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

  it("bounds connection establishment, acquisition and pool size for URL clients", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user@localhost:5432/resource_adapter");

    expect(getDatabaseClient().$client.options).toMatchObject({
      connectionTimeoutMillis: 10_000,
      max: 4,
    });
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

  it("refuses to guess when Cloud SQL is configured but not initialised", () => {
    vi.stubEnv("CLOUD_SQL_INSTANCE_CONNECTION_NAME", "oak:europe-west2:ora-stg");
    vi.stubEnv("DATABASE_URL", "postgresql://user@localhost:5432/resource_adapter");

    expect(() => getDatabaseClient()).toThrowError("initialiseDatabaseClient");
  });
});

describe("createUrlPoolConfig", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "passes a loopback URL through for %s",
    (host) => {
      const url = `postgresql://user@${host}:5432/resource_adapter?sslmode=disable`;

      expect(createUrlPoolConfig(url)).toEqual({ connectionString: url });
    },
  );

  it("refuses a host off the loopback interface without a certificate", () => {
    expect(() =>
      createUrlPoolConfig("postgresql://user:pw@34.1.2.3:5432/ora"),
    ).toThrowError("DATABASE_CA_CERT");
  });

  it("verifies the server against the configured certificate authority", () => {
    vi.stubEnv("DATABASE_CA_CERT", certificateAuthority);

    const config = createUrlPoolConfig("postgresql://ora_app:p%40ss@34.1.2.3:5432/ora");

    expect(config).toMatchObject({
      database: "ora",
      host: "34.1.2.3",
      password: "p@ss",
      port: 5432,
      user: "ora_app",
    });
    expect(config.ssl).toMatchObject({
      ca: certificateAuthority,
      rejectUnauthorized: true,
      checkServerIdentity: expect.any(Function),
    });
  });

  it.each([
    "postgresql://ora_app:pa#ss@34.1.2.3:5432/ora",
    "postgresql://ora_app:pa%ss@34.1.2.3:5432/ora",
    "https://ora_app:secret@34.1.2.3/ora",
    "postgresql://ora_app:secret@34.1.2.3/ora#fragment",
  ])("rejects an invalid URL without echoing credentials: %s", (url) => {
    expect(() => createUrlPoolConfig(url)).toThrowError(
      new Error(
        "DATABASE_URL must be a valid postgres:// or postgresql:// URL without " +
          "a fragment. Special characters in credentials must be percent-encoded.",
      ),
    );
  });

  it.each(["p#ss", "p?ss", "p/ss", "p%41ss", "p@ss"])(
    "decodes percent-encoded credentials exactly once: %s",
    (password) => {
      vi.stubEnv("DATABASE_CA_CERT", certificateAuthority);

      const config = createUrlPoolConfig(
        `postgres://ora_app:${encodeURIComponent(password)}@34.1.2.3/ora`,
      );

      expect(config.password).toBe(password);
      expect(config.port).toBe(5432);
    },
  );

  it.each(["sslmode=disable", "application_name=ora", "connect_timeout=5"])(
    "rejects rather than discards URL options with a CA: %s",
    (query) => {
      vi.stubEnv("DATABASE_CA_CERT", certificateAuthority);

      expect(() =>
        createUrlPoolConfig(`postgresql://ora_app:pw@34.1.2.3/ora?${query}`),
      ).toThrowError("query parameters are not supported");
    },
  );

  it("treats a whitespace-only CA as missing", () => {
    vi.stubEnv("DATABASE_CA_CERT", " \n ");

    expect(() =>
      createUrlPoolConfig("postgresql://ora_app:pw@34.1.2.3/ora"),
    ).toThrowError("DATABASE_CA_CERT is required");
  });

  it("preserves overlapping CA certificates for rotation", () => {
    const incomingAuthority = certificateAuthority.replace("staging", "incoming");
    const bundle = `${certificateAuthority}\n${incomingAuthority}`;
    vi.stubEnv("DATABASE_CA_CERT", `\n${bundle}\n`);

    expect(
      createUrlPoolConfig("postgresql://ora_app:pw@34.1.2.3/ora").ssl,
    ).toMatchObject({
      ca: bundle,
      rejectUnauthorized: true,
    });
  });

  it("removes IPv6 URL brackets from the socket host", () => {
    vi.stubEnv("DATABASE_CA_CERT", certificateAuthority);

    expect(createUrlPoolConfig("postgresql://ora_app:pw@[::1]:5432/ora").host).toBe(
      "::1",
    );
  });

  it("carries no connection string once a certificate applies", () => {
    vi.stubEnv("DATABASE_CA_CERT", certificateAuthority);

    expect(
      createUrlPoolConfig("postgresql://ora_app:pw@34.1.2.3:5432/ora"),
    ).not.toHaveProperty("connectionString");
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
    vi.stubEnv("DATABASE_URL", "postgresql://ora_app:pw@34.1.2.3/ora");
    vi.stubEnv("DATABASE_CA_CERT", certificateAuthority);

    await initialiseDatabaseClient();

    expect(createCloudSqlPoolConfig).toHaveBeenCalledOnce();
    expect(getDatabaseClient()).toBeDefined();
    expect(getDatabaseClient().$client.options).toMatchObject({
      connectionTimeoutMillis: 10_000,
      max: 4,
    });
  });

  // Rebuilding would open a fresh pool on every serverless invocation.
  it("does not rebuild when already initialised for the same instance", async () => {
    configureCloudSql();

    await initialiseDatabaseClient();
    await initialiseDatabaseClient();

    expect(createCloudSqlPoolConfig).toHaveBeenCalledOnce();
  });
});
