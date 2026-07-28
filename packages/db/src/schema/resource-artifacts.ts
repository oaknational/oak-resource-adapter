import { sql } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { resourceDocuments } from "./resource-documents.ts";

/** An exported file, identified by an immutable private storage key. */
export const resourceArtifacts = pgTable(
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
    resourceDocumentId: uuid("resource_document_id")
      .notNull()
      .references(() => resourceDocuments.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
  },
  (table) => [
    index("resource_artifacts_resource_document_id_idx").on(table.resourceDocumentId),
  ],
);

export type ResourceArtifact = typeof resourceArtifacts.$inferSelect;
export type NewResourceArtifact = typeof resourceArtifacts.$inferInsert;
