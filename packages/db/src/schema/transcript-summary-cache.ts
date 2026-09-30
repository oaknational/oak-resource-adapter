import { jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { resourceAdapterSchema } from "./pg-schema.js";

/**
 * Lesson transcript summaries, reused across requests by content key.
 *
 * A stand-in unless/until the data extraction service supplies lesson summaries,
 * when this table and its read-through wrapper can be removed. Nothing references it.
 */
export const transcriptSummaryCache = resourceAdapterSchema.table(
  "transcript_summary_cache",
  {
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The model invocation that produced the summary. Not a foreign key. */
    invocationId: uuid("invocation_id").notNull(),
    /** A hash over the transcript, prompt, model binding and output schema. */
    key: text("key").primaryKey(),
    /** The first lesson summarised under this key. */
    lessonSlug: text("lesson_slug").notNull(),
    model: text("model").notNull(),
    promptHash: text("prompt_hash").notNull(),
    summary: jsonb("summary").notNull(),
  },
);

export type TranscriptSummaryCacheRow = typeof transcriptSummaryCache.$inferSelect;
export type NewTranscriptSummaryCacheRow = typeof transcriptSummaryCache.$inferInsert;
