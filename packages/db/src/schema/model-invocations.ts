import {
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { promptTemplates } from "./prompt-templates.js";
import { resourceAdapterSchema } from "./pg-schema.js";
import { transformationAttempts } from "./transformation-attempts.js";

/**
 * One physical model call made during an attempt.
 *
 * An append-only log, deliberately not deduplicated: a retried workflow step that
 * calls the model again is two paid calls and must read as two rows.
 */
export const modelInvocations = resourceAdapterSchema.table(
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
    /** Minted by the invoker so the call can be recorded before it starts. */
    id: uuid("id").primaryKey(),
    /** Denormalised from the response, for cost-based rate limiting. */
    inputTokens: integer("input_tokens"),
    model: text("model").notNull(),
    outputTokens: integer("output_tokens"),
    /** Null for a call made without a registered template. */
    promptTemplateId: uuid("prompt_template_id"),
    provider: text("provider").notNull(),
    providerResponseId: text("provider_response_id"),
    /** The exact provider request, retained for replay and audit. */
    request: jsonb("request").notNull(),
    role: text("role").notNull(),
    /** Null while in flight, and for a call that failed before responding. */
    response: jsonb("response"),
    startedAt: timestamp("started_at", { precision: 3, withTimezone: true }).notNull(),
    transformationAttemptId: uuid("transformation_attempt_id").notNull(),
    transport: text("transport").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.transformationAttemptId],
      foreignColumns: [transformationAttempts.id],
      name: "model_invocations_attempt_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.promptTemplateId],
      foreignColumns: [promptTemplates.id],
      name: "model_invocations_prompt_template_fk",
    }).onDelete("restrict"),
    index("model_invocations_attempt_idx").on(table.transformationAttemptId),
    index("model_invocations_prompt_template_idx").on(table.promptTemplateId),
  ],
);

export type ModelInvocation = typeof modelInvocations.$inferSelect;
export type NewModelInvocation = typeof modelInvocations.$inferInsert;
