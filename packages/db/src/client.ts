import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.ts";

type DatabaseClient = InstanceType<typeof PrismaClient>;

const globalDatabase = globalThis as typeof globalThis & {
  resourceAdapterDatabaseClient?: DatabaseClient;
  resourceAdapterDatabaseUrl?: string;
};

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to connect to the database.");
  }

  return databaseUrl;
}

/** Creates an independent client, primarily for integration tests and scripts. */
export function createDatabaseClient(
  connectionString = requireDatabaseUrl(),
): DatabaseClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

/**
 * Returns the process-local application client.
 *
 * Reusing it avoids opening a new PostgreSQL pool for every Next.js request or
 * Workflow step while still allowing explicit clients in integration tests.
 */
export function getDatabaseClient(): DatabaseClient {
  const databaseUrl = requireDatabaseUrl();

  if (
    !globalDatabase.resourceAdapterDatabaseClient ||
    globalDatabase.resourceAdapterDatabaseUrl !== databaseUrl
  ) {
    globalDatabase.resourceAdapterDatabaseClient = createDatabaseClient(databaseUrl);
    globalDatabase.resourceAdapterDatabaseUrl = databaseUrl;
  }

  return globalDatabase.resourceAdapterDatabaseClient;
}

export type { DatabaseClient };
