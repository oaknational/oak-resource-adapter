/**
 * Applies pending migrations for deployment automation and the local reset script.
 *
 * Uses drizzle-orm's programmatic migrator rather than `drizzle-kit migrate`
 * because the advisory lock and `lock_timeout` below must be set on the same
 * session that runs the migration. Both read the same `drizzle/` folder and
 * journal, so this stays interchangeable with the CLI.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

config({ path: resolve(packageRoot, "../../.env"), quiet: true });

/**
 * An arbitrary constant. Its value carries no meaning; it only has to be the same
 * in every deployment, or two of them could migrate concurrently.
 */
const MIGRATION_LOCK_ID = 4162873051;

const LOCK_WAIT_SECONDS = Number(process.env.MIGRATION_LOCK_WAIT_SECONDS ?? 120);

if (!Number.isFinite(LOCK_WAIT_SECONDS) || LOCK_WAIT_SECONDS < 0) {
  console.error("MIGRATION_LOCK_WAIT_SECONDS must be a non-negative number.");
  process.exit(1);
}

/**
 * Caps how long a statement waits for a table lock. Without it, DDL queued behind
 * a long-running query blocks every later query on that table until it finishes.
 */
const LOCK_TIMEOUT = process.env.MIGRATION_LOCK_TIMEOUT ?? "10s";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to apply migrations.");
  process.exit(1);
}

/**
 * A single connection, not a pool: advisory locks belong to a session, so on a
 * pool the unlock could run on a different connection and release nothing.
 */
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const database = drizzle({ client });

/** Waits rather than blocking forever, so a wedged migration fails the deploy. */
async function acquireMigrationLock() {
  const deadline = Date.now() + LOCK_WAIT_SECONDS * 1000;

  for (;;) {
    const result = await database.execute(
      sql`SELECT pg_try_advisory_lock(${MIGRATION_LOCK_ID}) AS acquired`,
    );

    if (result.rows[0]?.acquired === true) {
      return;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${LOCK_WAIT_SECONDS}s waiting for the migration lock. ` +
          "Another deployment is likely still migrating.",
      );
    }

    console.log("Another deployment holds the migration lock; waiting…");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2000));
  }
}

try {
  await acquireMigrationLock();

  try {
    await database.execute(
      sql`SELECT set_config('lock_timeout', ${LOCK_TIMEOUT}, false)`,
    );
    await migrate(database, { migrationsFolder: resolve(packageRoot, "drizzle") });
    console.log("Migrations are up to date.");
  } finally {
    await database.execute(sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`);
  }
} catch (error) {
  console.error("Failed to apply migrations.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
