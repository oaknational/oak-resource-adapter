import { sql } from "drizzle-orm";
import { index, jsonb, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { resourceAdapterSchema } from "./pg-schema.js";

export const jobStatusEnum = resourceAdapterSchema.enum("job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const JobStatus = {
  FAILED: "failed",
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
} as const;

export type JobStatusValue = (typeof JobStatus)[keyof typeof JobStatus];

/** Product-facing lifecycle state for generic durable background work. */
export const jobs = resourceAdapterSchema.table(
  "jobs",
  {
    completedAt: timestamp("completed_at", { precision: 3, withTimezone: true }),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull().unique(),
    /** Job-kind-specific request, validated by the TypeScript job registry. */
    input: jsonb("input").notNull(),
    kind: text("kind").notNull(),
    startedAt: timestamp("started_at", { precision: 3, withTimezone: true }),
    status: jobStatusEnum("status").notNull().default("queued"),
    updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    workflowRunId: text("workflow_run_id").unique(),
  },
  (table) => [index("jobs_status_created_at_idx").on(table.status, table.createdAt)],
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
