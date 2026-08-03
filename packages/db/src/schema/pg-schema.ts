import { pgSchema } from "drizzle-orm/pg-core";

/**
 * Every table and enum lives here rather than in `public`.
 *
 * The name is a contract with Oak's Cloud-Config Terraform, which creates this
 * schema, owns it with the migration user, and grants
 * `resource_adapter_updater` and `resource_adapter_viewer` on it. `public` could
 * not be used: since PostgreSQL 15 it grants `CREATE` only to the database
 * owner, so the migration user would be refused when creating tables.
 */
export const resourceAdapterSchema = pgSchema("resource_adapter");
