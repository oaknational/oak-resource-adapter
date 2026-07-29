import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { generationAttempts } from "./generation-attempts.ts";
import { resourceDocuments } from "./resource-documents.ts";

/** Documents read by an attempt, shared by all outputs from that attempt. */
export const attemptInputResourceDocuments = pgTable(
  "attempt_input_resource_documents",
  {
    generationAttemptId: uuid("generation_attempt_id").notNull(),
    /** The resource being adapted, or wider lesson material for context. */
    inputRole: text("input_role").notNull(),
    /** Stable ordering, so prompt assembly is reproducible. */
    position: integer("position").notNull(),
    resourceDocumentId: uuid("resource_document_id").notNull(),
  },
  (table) => [
    check(
      "attempt_input_resource_documents_position_check",
      sql`${table.position} >= 0`,
    ),
    primaryKey({
      columns: [table.generationAttemptId, table.resourceDocumentId],
      name: "attempt_input_resource_documents_pkey",
    }),
    unique("attempt_input_resource_documents_attempt_position_key").on(
      table.generationAttemptId,
      table.position,
    ),
    foreignKey({
      columns: [table.generationAttemptId],
      foreignColumns: [generationAttempts.id],
      name: "attempt_input_resource_documents_attempt_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.resourceDocumentId],
      foreignColumns: [resourceDocuments.id],
      name: "attempt_input_resource_documents_document_fk",
    }).onDelete("restrict"),
    index("attempt_input_resource_documents_document_idx").on(table.resourceDocumentId),
  ],
);

export type AttemptInputResourceDocument =
  typeof attemptInputResourceDocuments.$inferSelect;
export type NewAttemptInputResourceDocument =
  typeof attemptInputResourceDocuments.$inferInsert;
