import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { generationAttempts } from "./generation-attempts.js";
import { promptTemplates } from "./prompt-templates.js";

/**
 * One physical model call made during an attempt.
 *
 * An append-only log, deliberately not deduplicated: a retried workflow step that
 * calls the model again is two paid calls and must read as two rows.
 */
export const modelInvocations = pgTable(
  "model_invocations",
  {
    completedAt: timestamp("completed_at", { precision: 3, withTimezone: true }),
    /** Usually a workflow step id. Correlation only, and not unique. */
    correlationKey: text("correlation_key"),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    durationMs: integer("duration_ms"),
    /** Classified metadata, never the raw error, which can carry prompt content. */
    errorCode: text("error_code"),
    errorName: text("error_name"),
    errorStatus: integer("error_status"),
    generationAttemptId: uuid("generation_attempt_id")
      .notNull()
      .references(() => generationAttempts.id, { onDelete: "cascade" }),
    /** Minted by the invoker so the call can be recorded before it starts. */
    id: uuid("id").primaryKey(),
    /** Denormalised from the response, for cost-based rate limiting. */
    inputTokens: integer("input_tokens"),
    model: text("model").notNull(),
    outputTokens: integer("output_tokens"),
    /** Null for a call made without a registered template. */
    promptTemplateId: uuid("prompt_template_id").references(() => promptTemplates.id, {
      onDelete: "restrict",
    }),
    provider: text("provider").notNull(),
    providerResponseId: text("provider_response_id"),
    /** The exact provider request, retained for replay and audit. */
    request: jsonb("request").notNull(),
    role: text("role").notNull(),
    /** Null while in flight, and for a call that failed before responding. */
    response: jsonb("response"),
    startedAt: timestamp("started_at", { precision: 3, withTimezone: true }).notNull(),
    transport: text("transport").notNull(),
  },
  (table) => [
    index("model_invocations_generation_attempt_id_idx").on(table.generationAttemptId),
    index("model_invocations_prompt_template_id_idx").on(table.promptTemplateId),
  ],
);

export type ModelInvocation = typeof modelInvocations.$inferSelect;
export type NewModelInvocation = typeof modelInvocations.$inferInsert;
