import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { jobs } from "./jobs.js";
import { resourceAdapterSchema } from "./pg-schema.js";
import { transformations } from "./transformations.js";

/** One execution of a transformation: its initial run or a retry. */
export const transformationAttempts = resourceAdapterSchema.table(
  "transformation_attempts",
  {
    /** Set when the teacher approves this attempt's generated result. */
    acceptedAt: timestamp("accepted_at", { precision: 3, withTimezone: true }),
    /** Starts at 1 and is unique within a transformation to prevent duplicate retries. */
    attemptNumber: integer("attempt_number").notNull(),
    /** Set when the attempt finished its work, including a run that produced nothing. */
    completedAt: timestamp("completed_at", { precision: 3, withTimezone: true }),
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
    check(
      "transformation_attempts_attempt_number_check",
      sql`${table.attemptNumber} >= 1`,
    ),
    check(
      "transformation_attempts_acceptance_check",
      sql`${table.acceptedAt} IS NULL OR ${table.completedAt} IS NOT NULL`,
    ),
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
