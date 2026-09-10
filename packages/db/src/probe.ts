import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";

import { getDatabaseClient, type DatabaseClient } from "./client.js";

export type DatabaseProbeFailure =
  "not-configured" | "certificate-rejected" | "refused" | "unavailable";

/** Query budget, separate from the pool's connection/acquisition timeout. */
const probeTimeoutMs = 3_000;

class ProbeTimeout extends Error {}

const certificateCodes = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_SIGNATURE_FAILURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

// PostgreSQL authorization, password, database-name and privilege failures.
const refusalCodes = new Set(["28000", "28P01", "3D000", "42501"]);

function readErrorCode(error: unknown): string | undefined {
  const visited = new Set<object>();

  // DrizzleQueryError keeps the driver's code on its cause, not on itself.
  while (typeof error === "object" && error !== null && !visited.has(error)) {
    visited.add(error);
    if ("code" in error && typeof error.code === "string") {
      return error.code;
    }
    error = "cause" in error ? error.cause : undefined;
  }

  return undefined;
}

function classify(error: unknown): DatabaseProbeFailure {
  if (error instanceof ProbeTimeout) {
    return "unavailable";
  }

  const code = readErrorCode(error);

  if (code && certificateCodes.has(code)) {
    return "certificate-rejected";
  }

  return code && refusalCodes.has(code) ? "refused" : "unavailable";
}

/** Resolves null when the database answered, or why it did not. */
export async function probeDatabase(): Promise<DatabaseProbeFailure | null> {
  let database: DatabaseClient;
  try {
    database = getDatabaseClient();
  } catch {
    return "not-configured";
  }

  let client: PoolClient | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let succeeded = false;

  try {
    client = await database.$client.connect();
    await Promise.race([
      drizzle({ client }).execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new ProbeTimeout()), probeTimeoutMs);
      }),
    ]);

    succeeded = true;
    return null;
  } catch (error) {
    return classify(error);
  } finally {
    clearTimeout(timer);
    // A response timeout alone leaves the query running. Destroy a failed or
    // timed-out connection instead of returning it to the application pool.
    client?.release(!succeeded);
  }
}
