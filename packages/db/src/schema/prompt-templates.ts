import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

/** An immutable cache of source-controlled prompts, upserted by content hash. */
export const promptTemplates = pgTable(
  "prompt_templates",
  {
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The commit the template was compiled from. */
    gitSha: text("git_sha"),
    /** Content hash of the compiled body; the upsert target. */
    hash: text("hash").notNull().unique(),
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** The stable logical name, such as "lower-reading-age". */
    identifier: text("identifier").notNull(),
    template: text("template").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    unique("prompt_templates_identifier_version_key").on(
      table.identifier,
      table.version,
    ),
  ],
);

export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type NewPromptTemplate = typeof promptTemplates.$inferInsert;
