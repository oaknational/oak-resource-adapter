import { sql } from "drizzle-orm";
import { integer, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { generations } from "./generations.js";
import { jobs } from "./jobs.js";

/** One execution of a generation: its initial run or a retry. */
export const generationAttempts = pgTable(
  "generation_attempts",
  {
    /** Starts at 1 and is unique within a generation to prevent duplicate retries. */
    attemptNumber: integer("attempt_number").notNull(),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    jobId: uuid("job_id")
      .notNull()
      .unique()
      .references(() => jobs.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("generation_attempts_generation_id_attempt_number_key").on(
      table.generationId,
      table.attemptNumber,
    ),
  ],
);

export type GenerationAttempt = typeof generationAttempts.$inferSelect;
export type NewGenerationAttempt = typeof generationAttempts.$inferInsert;
