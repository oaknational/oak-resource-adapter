import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema/index.js";

type DatabaseClient = ReturnType<typeof createDatabaseClient>;

const globalDatabase = globalThis as typeof globalThis & {
  resourceAdapterDatabaseClient?: DatabaseClient;
  resourceAdapterDatabaseKey?: string;
};

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to connect to the database.");
  }

  return databaseUrl;
}

function createClientFromPoolConfig(config: PoolConfig): DatabaseClient {
  return drizzle({ client: new Pool(config), schema });
}

/** Creates an independent client, primarily for integration tests and scripts. */
export function createDatabaseClient(connectionString = requireDatabaseUrl()) {
  return drizzle({
    client: new Pool({ connectionString }),
    schema,
  });
}

/**
 * Prepares the process-local client. Must be awaited before the first
 * `getDatabaseClient` call in any deployment configured for Cloud SQL, which
 * `apps/api/instrumentation.ts` does.
 *
 * A no-op when `DATABASE_URL` is the transport, covering local development, CI
 * and the migration job.
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

/**
 * Returns the process-local application client.
 *
 * Reusing it avoids opening a new PostgreSQL pool for every Next.js request or
 * Workflow step while still allowing explicit clients in integration tests.
 */
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
