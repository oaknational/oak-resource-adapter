import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({
  path: resolve(fileURLToPath(new URL("../../.env", import.meta.url))),
  quiet: true,
});

/**
 * Column names are written explicitly in the schema rather than derived by
 * drizzle-kit's `casing` option. That option has to be set identically here and
 * where the runtime client is constructed, and a mismatch makes generated SQL
 * silently disagree with the queries that run against it.
 */
export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/schema/index.ts",
  // Confines drizzle-kit to our own schema, so it never proposes dropping
  // anything it finds in `public` or in Terraform-managed schemas.
  schemaFilter: ["resource_adapter"],
  strict: true,
  verbose: true,
});
