/**
 * Drops and recreates the local database schema, then applies every migration.
 *
 * Destructive, so it refuses any host but localhost, with no override: a deployed
 * database is only ever changed by applying migrations forward.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

config({ path: resolve(packageRoot, "../../.env"), quiet: true });

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to reset the database.");
  process.exit(1);
}

let hostname;
try {
  ({ hostname } = new URL(databaseUrl));
} catch {
  console.error("DATABASE_URL is not a valid connection URL.");
  process.exit(1);
}

// Bracketed IPv6 hosts arrive as "[::1]".
const bareHostname = hostname.replace(/^\[|\]$/g, "");

if (!LOCAL_HOSTNAMES.has(bareHostname)) {
  console.error(
    `Refusing to reset a non-local database (host: ${bareHostname}).\n` +
      "This command drops every table. Deployed databases are only ever changed " +
      "by applying migrations forward with db:migrate:deploy.",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const database = drizzle({ client: pool });

try {
  console.log(`Dropping and recreating the schema on ${bareHostname}…`);
  await database.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  // Drizzle's migration journal lives in its own `drizzle` schema. Dropping only
  // `public` leaves it claiming everything is applied, so the migrator does
  // nothing and reports success against an empty database.
  await database.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await database.execute(sql`CREATE SCHEMA public`);
} catch (error) {
  console.error("Failed to recreate the schema.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

// A child process, so both commands share one implementation of "apply every
// migration".
const migration = spawnSync(
  process.execPath,
  [resolve(packageRoot, "scripts/migrate.mjs")],
  { stdio: "inherit" },
);

process.exit(migration.status ?? 1);
