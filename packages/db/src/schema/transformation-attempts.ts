import { sql } from "drizzle-orm";
import { foreignKey, integer, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { jobs } from "./jobs.js";
import { resourceAdapterSchema } from "./pg-schema.js";
import { transformations } from "./transformations.js";

/** One execution of a transformation: its initial run or a retry. */
export const transformationAttempts = resourceAdapterSchema.table(
  "transformation_attempts",
  {
    /** Starts at 1 and is unique within a transformation to prevent duplicate retries. */
    attemptNumber: integer("attempt_number").notNull(),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    jobId: uuid("job_id").notNull().unique(),
    transformationId: uuid("transformation_id").notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("transformation_attempts_number_key").on(
      table.transformationId,
      table.attemptNumber,
    ),
    foreignKey({
      columns: [table.transformationId],
      foreignColumns: [transformations.id],
      name: "transformation_attempts_transformation_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.jobId],
      foreignColumns: [jobs.id],
      name: "transformation_attempts_job_fk",
    }).onDelete("restrict"),
  ],
);

export type TransformationAttempt = typeof transformationAttempts.$inferSelect;
export type NewTransformationAttempt = typeof transformationAttempts.$inferInsert;
