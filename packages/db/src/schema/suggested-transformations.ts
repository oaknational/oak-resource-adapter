import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { resourceAdapterSchema } from "./pg-schema.js";
import { resourceDocuments } from "./resource-documents.js";
import { transformationAttempts } from "./transformation-attempts.js";
import { transformations } from "./transformations.js";

/** A change the model offered the teacher for one document version. */
export const suggestedTransformations = resourceAdapterSchema.table(
  "suggested_transformations",
  {
    /** Set when the teacher accepts. Null while the offer stands. */
    acceptedTransformationId: uuid("accepted_transformation_id"),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Keys into the same registry as `transformations.kind`. */
    kind: text("kind").notNull(),
    /** Arguments to apply if accepted, validated by the registry. */
    params: jsonb("params").notNull().default({}),
    position: integer("position").notNull(),
    /** The document this offer is about, which is not always what produced it. */
    resourceDocumentId: uuid("resource_document_id").notNull(),
    /** The block this offer targets. Null when it applies to the whole document. */
    targetBlockId: text("target_block_id"),
    /** The attempt that generated the offer, for tracing it to its model call. */
    transformationAttemptId: uuid("transformation_attempt_id").notNull(),
  },
  (table) => [
    check("suggested_transformations_position_check", sql`${table.position} >= 0`),
    unique("suggested_transformations_attempt_position_key").on(
      table.transformationAttemptId,
      table.position,
    ),
    /** A transformation comes from at most one offer, and an offer is accepted once. */
    unique("suggested_transformations_accepted_key").on(table.acceptedTransformationId),
    foreignKey({
      columns: [table.resourceDocumentId],
      foreignColumns: [resourceDocuments.id],
      name: "suggested_transformations_document_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.transformationAttemptId],
      foreignColumns: [transformationAttempts.id],
      name: "suggested_transformations_attempt_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.acceptedTransformationId],
      foreignColumns: [transformations.id],
      name: "suggested_transformations_accepted_fk",
    }).onDelete("set null"),
    index("suggested_transformations_document_idx").on(table.resourceDocumentId),
  ],
);

export type SuggestedTransformation = typeof suggestedTransformations.$inferSelect;
export type NewSuggestedTransformation = typeof suggestedTransformations.$inferInsert;
