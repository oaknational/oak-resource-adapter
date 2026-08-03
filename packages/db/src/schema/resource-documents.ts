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
import { transformationAttempts } from "./transformation-attempts.js";

/** Document provenance; input usage is represented by transformation inputs. */
export const resourceDocumentOriginEnum = resourceAdapterSchema.enum(
  "resource_document_origin",
  ["oak_resource", "generated"],
);

export const ResourceDocumentOrigin = {
  GENERATED: "generated",
  OAK_RESOURCE: "oak_resource",
} as const;

export type ResourceDocumentOriginValue =
  (typeof ResourceDocumentOrigin)[keyof typeof ResourceDocumentOrigin];

/** A persisted resource document, either externally sourced or generated. */
export const resourceDocuments = resourceAdapterSchema.table(
  "resource_documents",
  {
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The versioned document envelope. */
    document: jsonb("document").notNull(),
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
    transformationAttemptId: uuid("transformation_attempt_id"),
  },
  (table) => [
    /** Generated documents have one producer and position; other documents have neither. */
    check(
      "resource_documents_generated_has_attempt_and_position",
      sql`(${table.origin} = 'generated'
            AND ${table.transformationAttemptId} IS NOT NULL
            AND ${table.position} IS NOT NULL
            AND ${table.position} >= 0)
       OR (${table.origin} <> 'generated'
            AND ${table.transformationAttemptId} IS NULL
            AND ${table.position} IS NULL)`,
    ),
    unique("resource_documents_attempt_position_key").on(
      table.transformationAttemptId,
      table.position,
    ),
    foreignKey({
      columns: [table.transformationAttemptId],
      foreignColumns: [transformationAttempts.id],
      name: "resource_documents_attempt_fk",
    }).onDelete("cascade"),
    index("resource_documents_attempt_idx").on(table.transformationAttemptId),
    index("resource_documents_source_id_idx")
      .on(table.sourceId)
      .where(sql`${table.origin} <> 'generated'`),
  ],
);

export type StoredResourceDocument = typeof resourceDocuments.$inferSelect;
export type NewStoredResourceDocument = typeof resourceDocuments.$inferInsert;
