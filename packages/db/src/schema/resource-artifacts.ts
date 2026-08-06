import { sql } from "drizzle-orm";
import { bigint, foreignKey, index, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { resourceAdapterSchema } from "./pg-schema.js";
import { resourceDocuments } from "./resource-documents.js";

/** An exported file, identified by an immutable private storage key. */
export const resourceArtifacts = resourceAdapterSchema.table(
  "resource_artifacts",
  {
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    checksum: text("checksum"),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    format: text("format").notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    mimeType: text("mime_type").notNull(),
    resourceDocumentId: uuid("resource_document_id").notNull(),
    storageKey: text("storage_key").notNull().unique(),
  },
  (table) => [
    foreignKey({
      columns: [table.resourceDocumentId],
      foreignColumns: [resourceDocuments.id],
      name: "resource_artifacts_document_fk",
    }).onDelete("cascade"),
    index("resource_artifacts_document_idx").on(table.resourceDocumentId),
  ],
);

export type ResourceArtifact = typeof resourceArtifacts.$inferSelect;
export type NewResourceArtifact = typeof resourceArtifacts.$inferInsert;
