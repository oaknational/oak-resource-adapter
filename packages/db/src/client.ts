import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema/index.js";

type DatabaseClient = ReturnType<typeof createClientFromPoolConfig>;

const globalDatabase = globalThis as typeof globalThis & {
  resourceAdapterDatabaseClient?: DatabaseClient;
  resourceAdapterDatabaseKey?: string;
};

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to connect to the database.");
  }

  return databaseUrl;
}

type DatabaseAddress = {
  database: string;
  host: string;
  password: string;
  port: number;
  user: string;
};

function readDatabaseUrl(databaseUrl: string): DatabaseAddress & { search: string } {
  try {
    const url = new URL(databaseUrl);

    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      url.hash
    ) {
      throw new Error("Invalid PostgreSQL URL");
    }

    return {
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      host: url.hostname.replace(/^\[|\]$/g, ""),
      password: decodeURIComponent(url.password),
      port: Number(url.port || 5432),
      search: url.search,
      user: decodeURIComponent(url.username),
    };
  } catch {
    // URL parsing errors can include the connection string and its password.
    throw new Error(
      "DATABASE_URL must be a valid postgres:// or postgresql:// URL without " +
        "a fragment. Special characters in credentials must be percent-encoded.",
    );
  }
}

/** URL TLS parameters override `pg`'s sibling `ssl` option; do not combine them. */
export function createUrlPoolConfig(databaseUrl: string): PoolConfig {
  const certificateAuthority = process.env.DATABASE_CA_CERT?.trim();
  const { search, ...address } = readDatabaseUrl(databaseUrl);

  if (!certificateAuthority) {
    if (!loopbackHosts.has(address.host)) {
      throw new Error(
        "DATABASE_CA_CERT is required to reach a database off the loopback " +
          "interface, so that a connection crossing the public internet " +
          "verifies the server it reaches.",
      );
    }

    return { connectionString: databaseUrl };
  }

  if (search) {
    throw new Error(
      "DATABASE_URL query parameters are not supported when DATABASE_CA_CERT is set. " +
        "Supply only the PostgreSQL address and credentials; TLS is configured separately.",
    );
  }

  return {
    ...address,
    ssl: {
      ca: certificateAuthority,
      rejectUnauthorized: true,
      // GOOGLE_MANAGED_INTERNAL_CA identifies the instance by its unique CA,
      // not its public IP. Shared CA modes require hostname verification.
      // https://cloud.google.com/sql/docs/postgres/authorize-ssl
      checkServerIdentity: () => undefined,
    },
  };
}

function createClientFromPoolConfig(config: PoolConfig) {
  return drizzle({
    client: new Pool({
      ...config,
      // Bounds both connection establishment and waiting for a free pool slot.
      // Shared-core instances can be slow to connect under CPU pressure.
      connectionTimeoutMillis: 10_000,
      // Each function instance has its own pool; all share the database's
      // connection budget with migrations and administration.
      max: 4,
    }),
    schema,
  });
}

/** Creates an independent client, primarily for integration tests and scripts. */
export function createDatabaseClient(connectionString = requireDatabaseUrl()) {
  return createClientFromPoolConfig(createUrlPoolConfig(connectionString));
}

/**
 * Prepares the process-local client. Must be awaited before the first
 * `getDatabaseClient` call in any deployment configured for Cloud SQL, which
 * `apps/api/instrumentation.ts` does.
 *
 * A no-op when `DATABASE_URL` is the transport.
 */
export async function initialiseDatabaseClient(): Promise<void> {
  const { readCloudSqlConfig } = await import("./cloud-sql.js");
  const cloudSqlConfig = readCloudSqlConfig();

  if (!cloudSqlConfig) {
    return;
  }

  if (
    globalDatabase.resourceAdapterDatabaseKey === cloudSqlConfig.instanceConnectionName
  ) {
    return;
  }

  const { createCloudSqlPoolConfig } = await import("./cloud-sql.js");

  globalDatabase.resourceAdapterDatabaseClient = createClientFromPoolConfig(
    await createCloudSqlPoolConfig(cloudSqlConfig),
  );
  globalDatabase.resourceAdapterDatabaseKey = cloudSqlConfig.instanceConnectionName;
}

/** Reuses one pool across Next.js requests and Workflow steps in this process. */
export function getDatabaseClient(): DatabaseClient {
  if (process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME?.trim()) {
    if (!globalDatabase.resourceAdapterDatabaseClient) {
      throw new Error(
        "This deployment connects to Cloud SQL, so initialiseDatabaseClient() must " +
          "be awaited before the first query. It runs from instrumentation.ts.",
      );
    }

    return globalDatabase.resourceAdapterDatabaseClient;
  }

  const databaseUrl = requireDatabaseUrl();

  if (
    !globalDatabase.resourceAdapterDatabaseClient ||
    globalDatabase.resourceAdapterDatabaseKey !== databaseUrl
  ) {
    globalDatabase.resourceAdapterDatabaseClient = createDatabaseClient(databaseUrl);
    globalDatabase.resourceAdapterDatabaseKey = databaseUrl;
  }

  return globalDatabase.resourceAdapterDatabaseClient;
}

export type { DatabaseClient };
