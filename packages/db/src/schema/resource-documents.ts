import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { generationAttempts } from "./generation-attempts.ts";

/** Document provenance; input usage is represented by attempt relationships. */
export const resourceDocumentOriginEnum = pgEnum("resource_document_origin", [
  "oak_resource",
  "generated",
]);

export const ResourceDocumentOrigin = {
  GENERATED: "generated",
  OAK_RESOURCE: "oak_resource",
} as const;

export type ResourceDocumentOriginValue =
  (typeof ResourceDocumentOrigin)[keyof typeof ResourceDocumentOrigin];

/** A persisted resource document, either externally sourced or generated. */
export const resourceDocuments = pgTable(
  "resource_documents",
  {
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The versioned document envelope. */
    document: jsonb("document").notNull(),
    generationAttemptId: uuid("generation_attempt_id").references(
      () => generationAttempts.id,
      { onDelete: "cascade" },
    ),
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    origin: resourceDocumentOriginEnum("origin").notNull(),
    /**
     * Stable order among the documents produced by one attempt. Null when the
     * document was not generated here.
     */
    position: integer("position"),
    retrievedAt: timestamp("retrieved_at", { precision: 3, withTimezone: true }),
    /** Identifier supplied by the origin system. */
    sourceId: text("source_id"),
    sourceReference: jsonb("source_reference"),
  },
  (table) => [
    /** Generated documents have one producer and position; other documents have neither. */
    check(
      "resource_documents_generated_has_attempt_and_position",
      sql`(${table.origin} = 'generated'
            AND ${table.generationAttemptId} IS NOT NULL
            AND ${table.position} IS NOT NULL
            AND ${table.position} >= 0)
       OR (${table.origin} <> 'generated'
            AND ${table.generationAttemptId} IS NULL
            AND ${table.position} IS NULL)`,
    ),
    unique("resource_documents_generation_attempt_id_position_key").on(
      table.generationAttemptId,
      table.position,
    ),
    index("resource_documents_generation_attempt_id_idx").on(table.generationAttemptId),
    index("resource_documents_source_id_idx")
      .on(table.sourceId)
      .where(sql`${table.origin} <> 'generated'`),
  ],
);

export type StoredResourceDocument = typeof resourceDocuments.$inferSelect;
export type NewStoredResourceDocument = typeof resourceDocuments.$inferInsert;
